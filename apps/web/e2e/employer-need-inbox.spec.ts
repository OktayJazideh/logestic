import { expect, test } from "@playwright/test";
import { apiBase, loginApi, selectWorkspace } from "./helpers/api";

const MINE_A = 1;

test("Employer Need ثبت → Inbox", async ({ page, request }) => {
  const employerToken = await loginApi(request, "09000000007");
  await selectWorkspace(request, employerToken, MINE_A);

  await page.goto("/login");
  await page.evaluate((token) => localStorage.setItem("auth_token", token), employerToken);
  await page.goto("/panel/employer");

  await page.getByTestId("employer-village").selectOption({ index: 1 });
  await page.getByTestId("employer-material").fill("ORE");
  const tons = `17.${Date.now() % 1000}`;
  await page.getByTestId("employer-tons").fill(tons);
  await page.getByTestId("employer-submit").click();

  const success = page.getByText(/نیاز #\d+ با موفقیت ثبت شد/);
  await expect(success).toBeVisible({ timeout: 15_000 });
  const match = (await success.textContent())?.match(/نیاز #(\d+)/);
  expect(match).toBeTruthy();
  const needId = match![1];

  await page.goto("/panel/employer/inbox");
  await expect(page.getByTestId("employer-inbox-table")).toBeVisible();
  await expect(page.getByTestId(`employer-need-row-${needId}`)).toBeVisible();
  const row = page.getByTestId(`employer-need-row-${needId}`);
  await expect(row).toContainText("ORE");
  await expect(row).toContainText("در انتظار");
});
