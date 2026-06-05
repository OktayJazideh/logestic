import { expect, test, type Page } from "@playwright/test";
import { expectSidebarNavLink, loginAsPanel } from "./helpers/api";

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
  await expectSidebarNavLink(page, /کارکرد ساعتی/i);
  const count = await sidebar(page).locator("a").count();
  expect(count).toBe(1);
});

test("ADMIN sees user management nav", async ({ page, request }) => {
  await loginAsPanel(page, request, "09000000000", { mineId: 1 });
  // Simple UI: ADMIN quick actions on /panel home (stable; sidebar may collapse items under «بیشتر»).
  await expect(page.getByTestId("home-link--panel-admin-users")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("home-link--panel-admin-user-requests")).toBeVisible({ timeout: 15_000 });
});

test("COOP_ADMIN sees user request form not admin users", async ({ page, request }) => {
  await loginAsPanel(page, request, "09000000001", {
    mineId: 1,
    cooperativeId: 1,
    membership_kind: "COMMUNITY",
  });
  await expectSidebarNavLink(page, /ثبت کاربر جدید/i);
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
