import { expect, test } from "@playwright/test";
import { loginViaUi } from "./helpers/auth";

test("EMPLOYER nav excludes settlement and has at most 4 items", async ({ page, request }) => {
  await loginViaUi(page, "09000000007", request);
  await expect(page.getByRole("link", { name: /Settlement/i })).toHaveCount(0);
  const count = await page.locator("aside a").count();
  expect(count).toBeLessThanOrEqual(4);
});

test("CONSULTANT nav has exactly one work item and no settlement leak", async ({ page, request }) => {
  await loginViaUi(page, "09000000006", request);
  await expect(page.getByRole("link", { name: /Settlement/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /کیف پول/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /HOLD/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /کارکرد ساعتی/i })).toBeVisible();
  const count = await page.locator("aside a").count();
  expect(count).toBe(1);
});
