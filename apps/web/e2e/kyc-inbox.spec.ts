import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { apiBase, loginApi, registerDevUser, selectWorkspace } from "./helpers/api";

const MINE_A = 1;
const COOP_A = 1;

test.beforeAll(() => {
  execSync("npm run db:seed", { cwd: "../backend", stdio: "pipe" });
});

function toPersianDigits(value: string): string {
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  return value.replace(/\d/g, (d) => fa[Number(d)] ?? d);
}

function e2eHeadName(villageId: number, suffix: string): string {
  const tag = toPersianDigits(suffix.replace(/\D/g, "").slice(-4));
  return villageId === 1 ? `خانوار آزمایش الف ${tag}` : `خانوار آزمایش ب ${tag}`;
}

async function createPendingHousehold(
  request: import("@playwright/test").APIRequestContext,
  adminToken: string,
  villageId: number,
  suffix: string,
): Promise<number> {
  const digits = suffix.replace(/\D/g, "").slice(-7);
  const mobile = `0904${String(villageId)}${digits}`.slice(0, 11);
  await registerDevUser(request, adminToken, mobile, { role: "HOUSEHOLD", cooperativeId: COOP_A });
  const otpReq = await request.post(`${apiBase}/api/auth/request-otp`, { data: { mobile_number: mobile } });
  expect(otpReq.ok()).toBeTruthy();
  const otpRes = await request.get(`${apiBase}/api/auth/__dev/otp?mobile_number=${mobile}`);
  const otp = ((await otpRes.json()) as { data?: { otp?: string } }).data?.otp;
  expect(otp).toBeTruthy();
  const verify = await request.post(`${apiBase}/api/auth/verify-otp`, {
    data: { mobile_number: mobile, otp_code: otp },
  });
  const applicantToken = ((await verify.json()) as { data?: { access_token?: string } }).data?.access_token;
  expect(applicantToken).toBeTruthy();

  const headName = e2eHeadName(villageId, suffix);
  const req = await request.post(`${apiBase}/api/coop/households/request`, {
    headers: { Authorization: `Bearer ${applicantToken}` },
    data: {
      cooperative_id: COOP_A,
      village_id: villageId,
      head_name: headName,
      national_id: `e2e${suffix.replace(/\D/g, "").slice(-10)}`,
    },
  });
  const bodyText = await req.text();
  expect(req.status(), bodyText).toBe(201);
  const body = JSON.parse(bodyText) as { data?: { household?: { id: number } } };
  const householdId = body.data?.household?.id;
  expect(householdId).toBeTruthy();
  return householdId!;
}

test("KYC inbox: filter village → row count decreases", async ({ page, request }) => {
  const suffix = String(Date.now());
  const adminToken = await loginApi(request, "09000000000");
  const householdV1 = await createPendingHousehold(request, adminToken, 1, `${suffix}-v1`);
  const householdV2 = await createPendingHousehold(request, adminToken, 2, `${suffix}-v2`);

  const coopToken = await loginApi(request, "09000000111");
  await selectWorkspace(request, coopToken, MINE_A, {
    cooperativeId: COOP_A,
    membership_kind: "COMMUNITY",
  });

  const inboxApi = await request.get(`${apiBase}/api/coop/kyc/inbox?status=PENDING&limit=5`, {
    headers: { Authorization: `Bearer ${coopToken}` },
  });
  const inboxJson = (await inboxApi.json()) as { data?: { total?: number } };
  expect(inboxApi.ok(), JSON.stringify(inboxJson)).toBeTruthy();
  expect(inboxJson.data?.total ?? 0).toBeGreaterThan(0);

  await page.goto("/login");
  await page.evaluate((token) => localStorage.setItem("auth_token", token), coopToken);

  const inboxRespPromise = page.waitForResponse(
    (r) => r.url().includes("/coop/kyc/inbox") && r.status() === 200,
  );
  await page.goto("/panel/kyc");
  const inboxResp = await inboxRespPromise;
  const inboxBody = (await inboxResp.json()) as { data?: { total?: number; items?: unknown[] } };
  expect(inboxBody.data?.total ?? 0).toBeGreaterThan(0);

  await expect(page.getByTestId("kyc-inbox-table")).toBeVisible({ timeout: 15_000 });

  const parseTotal = async () => {
    const text = await page.getByTestId("kyc-inbox-row-count").textContent();
    const m = text?.match(/(\d+)\s*مورد/);
    return m ? Number(m[1]) : 0;
  };

  await expect.poll(parseTotal, { timeout: 10_000 }).toBeGreaterThan(0);
  const stableTotal = await parseTotal();

  await page.getByTestId("kyc-inbox-village-filter").selectOption("1");

  await expect.poll(parseTotal, { timeout: 10_000 }).toBeLessThan(stableTotal);

  const filteredTotal = await parseTotal();
  expect(filteredTotal).toBeGreaterThan(0);

  await expect(page.getByTestId(`kyc-inbox-table-row-household-${householdV1}`)).toBeVisible();
  await expect(page.getByTestId(`kyc-inbox-table-row-household-${householdV2}`)).toHaveCount(0);
});
