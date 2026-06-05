import { expect, test, type Page } from "@playwright/test";
import { loginAsPanel } from "./helpers/api";

const sidebar = (page: Page) => page.locator("aside");

test("EMPLOYER nav excludes settlement and has at most 4 items", async ({ page, request }) => {
  await loginAsPanel(page, request, "09000000007", { mineId: 1 });
  await expect(sidebar(page).getByRole("link", { name: /Settlement/i })).toHaveCount(0);
  const count = await sidebar(page).locator("a").count();
  expect(count).toBeLessThanOrEqual(4);
});

test("CONSULTANT nav has exactly one work item and no settlement leak", async ({ page, request }) => {
  await loginAsPanel(page, request, "09000000006", { mineId: 1 });
  await expect(sidebar(page).getByRole("link", { name: /Settlement/i })).toHaveCount(0);
  await expect(sidebar(page).getByRole("link", { name: /کیف پول/i })).toHaveCount(0);
  await expect(sidebar(page).getByRole("link", { name: /HOLD/i })).toHaveCount(0);
  await expect(sidebar(page).getByRole("link", { name: /کارکرد ساعتی/i })).toBeVisible();
  const count = await sidebar(page).locator("a").count();
  expect(count).toBe(1);
});

test("ADMIN sees user management nav", async ({ page, request }) => {
  await loginAsPanel(page, request, "09000000000");
  await expect(sidebar(page).getByRole("link", { name: /مدیریت کاربران/i })).toBeVisible();
  await expect(sidebar(page).getByRole("link", { name: /درخواست‌های کاربر/i })).toBeVisible();
});

test("COOP_ADMIN sees user request form not admin users", async ({ page, request }) => {
  await loginAsPanel(page, request, "09000000001", {
    mineId: 1,
    cooperativeId: 1,
    membership_kind: "COMMUNITY",
  });
  await expect(sidebar(page).getByRole("link", { name: /ثبت کاربر جدید/i })).toBeVisible();
  await expect(sidebar(page).getByRole("link", { name: /مدیریت کاربران/i })).toHaveCount(0);
});

test("home shows only accessible sections (no locked cards)", async ({ page, request }) => {
  await loginAsPanel(page, request, "09000000007", { mineId: 1 });
  await page.goto("/panel");
  await expect(page.getByTestId(/home-link-locked/)).toHaveCount(0);
  const homeLinks = page.locator("[data-testid^='home-link-']");
  await expect(homeLinks.first()).toBeVisible();
  const count = await homeLinks.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(6);
});
