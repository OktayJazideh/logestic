import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const apiBase = process.env.API_BASE_URL ?? "http://localhost:4000";

export async function registerDevUser(
  request: APIRequestContext,
  adminToken: string,
  mobile: string,
  opts?: { role?: string; cooperativeId?: number },
): Promise<void> {
  const r = await request.post(`${apiBase}/api/__dev/users/register`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: {
      mobile_number: mobile,
      role: opts?.role ?? "HOUSEHOLD",
      cooperative_id: opts?.cooperativeId,
      is_active: true,
    },
  });
  const json = (await r.json()) as { success?: boolean };
  if (!r.ok() || !json.success) {
    throw new Error(`dev user register failed for ${mobile}: ${JSON.stringify(json)}`);
  }
}

export async function loginApi(request: APIRequestContext, mobile: string): Promise<string> {
  await request.post(`${apiBase}/api/auth/request-otp`, {
    data: { mobile_number: mobile },
  });
  const otpRes = await request.get(`${apiBase}/api/auth/__dev/otp?mobile_number=${mobile}`);
  const otpJson = (await otpRes.json()) as { data?: { otp?: string } };
  const otp = otpJson.data?.otp;
  if (!otp) throw new Error(`dev OTP missing for ${mobile}`);
  const verify = await request.post(`${apiBase}/api/auth/verify-otp`, {
    data: { mobile_number: mobile, otp_code: otp },
  });
  const body = (await verify.json()) as { success?: boolean; data?: { access_token?: string } };
  if (!body.success || !body.data?.access_token) {
    throw new Error(`login failed for ${mobile}`);
  }
  return body.data.access_token;
}

/** API login + token injection — avoids flaky OTP UI in CI. */
export async function loginAsPanel(
  page: Page,
  request: APIRequestContext,
  mobile: string,
  opts?: { mineId?: number; cooperativeId?: number; membership_kind?: "OPERATIONAL" | "COMMUNITY" },
) {
  const token = await loginApi(request, mobile);
  if (opts?.mineId != null) {
    await selectWorkspace(request, token, opts.mineId, {
      cooperativeId: opts.cooperativeId,
      membership_kind: opts.membership_kind,
    });
  }
  await page.goto("/login");
  await page.evaluate((t) => localStorage.setItem("auth_token", t), token);
  const authReady = Promise.all([
    page.waitForResponse((r) => r.url().includes("/auth/me") && r.status() === 200, { timeout: 15_000 }),
    page.waitForResponse((r) => r.url().includes("/auth/myPermissions") && r.status() === 200, {
      timeout: 15_000,
    }),
  ]);
  await page.goto("/panel");
  await page.waitForURL(/\/panel/, { timeout: 15_000 });
  await authReady;
  await expect(page.locator(".panel-nav__link").first()).toBeVisible({ timeout: 15_000 });
}

/** Sidebar link — opens mobile / «بیشتر» menus when the item is collapsed. */
export async function expectSidebarNavLink(page: Page, name: RegExp | string) {
  const sidebar = page.locator("#panel-sidebar");
  await expect(sidebar).toBeAttached({ timeout: 15_000 });

  const menuBtn = page.getByTestId("panel-menu-toggle");
  if (await menuBtn.isVisible()) {
    await menuBtn.click();
  }

  const link = sidebar.getByRole("link", { name });
  const linkVisible = (await link.count()) > 0 && (await link.first().isVisible());
  if (!linkVisible) {
    const more = page.getByTestId("panel-nav-more-toggle");
    if (await more.isVisible()) {
      await more.click();
    }
  }

  await expect(sidebar.getByRole("link", { name })).toBeVisible({ timeout: 15_000 });
}

export async function selectWorkspace(
  request: APIRequestContext,
  token: string,
  mineId: number,
  opts?: { cooperativeId?: number; membership_kind?: "OPERATIONAL" | "COMMUNITY" },
) {
  const membershipKind =
    opts?.membership_kind ?? (opts?.cooperativeId != null ? "COMMUNITY" : "OPERATIONAL");
  const r = await request.post(`${apiBase}/api/workspaces/select`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      mine_id: mineId,
      cooperative_id: opts?.cooperativeId,
      membership_kind: membershipKind,
    },
  });
  const json = (await r.json()) as { success?: boolean };
  if (!r.ok() || !json.success) {
    throw new Error(`workspace select failed for mine ${mineId}: ${JSON.stringify(json)}`);
  }
}

/** Seed demo fleet/KYC then close the demo mission so dispatch tests can assign drivers. */
export async function seedDemoFleet(
  request: APIRequestContext,
  adminToken: string,
  mineId: number,
  opts?: { quantityTons?: number },
) {
  const seed = await request.post(`${apiBase}/api/__dev/seed/demo`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: {
      mine_id: mineId,
      quantity_tons: opts?.quantityTons ?? 1,
      material_type: "ORE",
    },
  });
  const seedJson = (await seed.json()) as { success?: boolean };
  if (!seed.ok() || !seedJson.success) {
    throw new Error(`dev seed failed: ${JSON.stringify(seedJson)}`);
  }
  await cleanupSettlementPeriodApi(request, adminToken, mineId);
}

/** Resolve driver session for dispatched mission (dev seed + disp test fleet). */
export async function loginDriverForAssignment(
  request: APIRequestContext,
  adminToken: string,
  mineId: number,
  driverId: number,
): Promise<string> {
  const grant = await request.post(`${apiBase}/api/__dev/workspaces/ensure-driver-mine`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { mine_id: mineId, driver_id: driverId },
  });
  const grantJson = (await grant.json()) as {
    success?: boolean;
    data?: { mobile_number?: string | null };
  };
  if (!grant.ok() || !grantJson.success || !grantJson.data?.mobile_number) {
    throw new Error(`ensure-driver-mine failed: ${JSON.stringify(grantJson)}`);
  }
  const token = await loginApi(request, grantJson.data.mobile_number);
  await selectWorkspace(request, token, mineId);
  return token;
}

export async function cleanupSettlementPeriodApi(
  request: APIRequestContext,
  adminToken: string,
  mineId: number,
  year?: number,
  month?: number,
) {
  const r = await request.post(`${apiBase}/api/__dev/cleanup/settlement-period`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { mine_id: mineId, year, month },
  });
  const json = (await r.json()) as { success?: boolean };
  if (!r.ok() || !json.success) {
    throw new Error(`cleanup settlement-period failed: ${JSON.stringify(json)}`);
  }
}

export async function pollJobApi(
  request: APIRequestContext,
  jobId: string,
  token: string,
): Promise<{ status: string; result?: unknown; error?: string }> {
  for (let i = 0; i < 150; i++) {
    const r = await request.get(`${apiBase}/api/admin/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await r.json()) as {
      success?: boolean;
      data?: { job?: { status: string; error?: string; result?: unknown } };
    };
    if (!r.ok() || !json.success || !json.data?.job) {
      throw new Error(`poll job ${jobId} failed: ${JSON.stringify(json)}`);
    }
    const job = json.data.job;
    if (job.status === "completed") return job;
    if (job.status === "failed") throw new Error(job.error ?? "job_failed");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`poll timeout for job ${jobId}`);
}
