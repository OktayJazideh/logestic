import { expect, test } from "@playwright/test";
import { apiBase, loginApi, seedDemoFleet, selectWorkspace } from "./helpers/api";

const MINE_A = 1;

test("OPERATION_ADMIN: seed → inbox → auto-dispatch → DISPATCHED + mission link", async ({
  page,
  request,
}) => {
  const adminToken = await loginApi(request, "09000000000");
  const employerToken = await loginApi(request, "09000000007");

  await seedDemoFleet(request, adminToken, MINE_A);

  await selectWorkspace(request, employerToken, MINE_A);
  const needRes = await request.post(`${apiBase}/api/employer/needs`, {
    headers: { Authorization: `Bearer ${employerToken}`, "Idempotency-Key": crypto.randomUUID() },
    data: {
      village_id: 1,
      material_type: "ORE",
      quantity_tons: 10,
      note: "employer-inbox-dispatch e2e",
    },
  });
  const needJson = (await needRes.json()) as {
    success?: boolean;
    data?: { need: { id: number; status: string } };
  };
  expect(needRes.status(), JSON.stringify(needJson)).toBe(201);
  const needId = needJson.data!.need.id;
  expect(needJson.data!.need.status).toBe("PENDING");

  const opsToken = await loginApi(request, "09000000002");
  await selectWorkspace(request, opsToken, MINE_A);

  let idempotencySeen = false;
  await page.route("**/api/admin/needs/*/dispatch", async (route) => {
    const key = route.request().headers()["idempotency-key"];
    if (key && key.length > 0) idempotencySeen = true;
    await route.continue();
  });

  await page.goto("/login");
  await page.evaluate((token) => localStorage.setItem("auth_token", token), opsToken);
  await page.goto("/panel/employer/inbox");

  await expect(page.getByTestId("employer-inbox-table")).toBeVisible();
  const row = page.getByTestId(`employer-need-row-${needId}`);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId(`employer-dispatch-${needId}`)).toBeVisible();

  await page.getByTestId(`employer-dispatch-${needId}`).click();

  await expect(page.getByTestId("employer-inbox-toast")).toContainText(/مأموریت #\d+/, {
    timeout: 15_000,
  });
  const missionLink = page.getByTestId("employer-inbox-toast").getByRole("link", { name: /مأموریت #\d+/ });
  await expect(missionLink).toBeVisible();
  const href = await missionLink.getAttribute("href");
  expect(href).toMatch(/\/panel\/missions\/\d+/);

  await expect(page.getByTestId(`employer-need-status-${needId}`)).toContainText("تخصیص‌شده");
  await expect(row.getByRole("link", { name: /مأموریت #\d+/ })).toBeVisible();
  expect(idempotencySeen).toBe(true);
});

test("EMPLOYER: inbox read-only — no dispatch button", async ({ page, request }) => {
  const employerToken = await loginApi(request, "09000000007");
  await selectWorkspace(request, employerToken, MINE_A);

  await page.goto("/login");
  await page.evaluate((token) => localStorage.setItem("auth_token", token), employerToken);
  await page.goto("/panel/employer/inbox");

  await expect(page.getByTestId("employer-inbox-table")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "تخصیص خودکار" })).toHaveCount(0);
});
