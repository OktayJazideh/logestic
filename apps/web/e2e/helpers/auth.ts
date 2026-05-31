import { expect, type APIRequestContext, type Page } from "@playwright/test";

const apiBase = process.env.API_BASE_URL ?? "http://localhost:4000";

export async function fetchDevOtp(request: APIRequestContext, mobile: string): Promise<string> {
  const res = await request.get(`${apiBase}/api/auth/__dev/otp?mobile_number=${mobile}`);
  const json = (await res.json()) as { data?: { otp?: string } };
  const otp = json.data?.otp;
  if (!otp) throw new Error(`dev OTP missing for ${mobile}`);
  return otp;
}

export async function loginViaUi(page: Page, mobile: string, request: APIRequestContext) {
  await page.goto("/login");
  await page.getByTestId("login-mobile").fill(mobile);

  for (let attempt = 0; attempt < 3; attempt++) {
    const otpReq = page.waitForResponse(
      (r) => r.url().includes("/auth/request-otp") && r.status() === 200,
      { timeout: 15_000 },
    );
    await page.getByTestId("login-request-otp").click();
    try {
      await otpReq;
      await expect(page.getByTestId("login-otp")).toBeVisible({ timeout: 5_000 });
      break;
    } catch (e) {
      if (attempt === 2) throw e;
      await page.waitForTimeout(500);
    }
  }

  const otp = await fetchDevOtp(request, mobile);
  await page.getByTestId("login-otp").fill(otp);
  await page.getByTestId("login-verify").click();
  await page.waitForURL(/\/(panel|workspace-select)/, { timeout: 15_000 });
  if (page.url().includes("workspace-select")) {
    const workspace = page.locator(
      '[data-testid^="workspace-operational-"], [data-testid^="workspace-community-"]',
    );
    await expect(workspace.first()).toBeVisible({ timeout: 15_000 });
    await workspace.first().click();
    await page.waitForURL(/\/panel/, { timeout: 15_000 });
  }
}
