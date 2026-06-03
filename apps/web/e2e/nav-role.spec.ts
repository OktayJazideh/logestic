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

test("ADMIN sees user management nav", async ({ page, request }) => {
  await loginViaUi(page, "09000000000", request);
  await expect(page.getByRole("link", { name: /مدیریت کاربران/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /درخواست‌های کاربر/i })).toBeVisible();
});

test("COOP_ADMIN sees user request form not admin users", async ({ page, request }) => {
  await loginViaUi(page, "09000000001", request);
  await expect(page.getByRole("link", { name: /ثبت کاربر جدید/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /مدیریت کاربران/i })).toHaveCount(0);
});

test("home shows only accessible sections (no locked cards)", async ({ page, request }) => {
  await loginViaUi(page, "09000000007", request);
  await page.goto("/panel");
  await expect(page.getByTestId(/home-link-locked/)).toHaveCount(0);
  const homeLinks = page.locator("[data-testid^='home-link-']");
  await expect(homeLinks.first()).toBeVisible();
  const count = await homeLinks.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(6);
});
