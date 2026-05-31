import { expect, test } from "@playwright/test";
import { apiBase, loginApi, selectWorkspace } from "./helpers/api";

const MINE_A = 1;

test("OPERATION_ADMIN: dispatch board — PENDING need → auto-dispatch → leaves column", async ({
  page,
  request,
}) => {
  const adminToken = await loginApi(request, "09000000000");
  const employerToken = await loginApi(request, "09000000007");

  const seed = await request.post(`${apiBase}/api/__dev/seed/demo`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { mine_id: MINE_A, quantity_tons: 1, material_type: "ORE" },
  });
  const seedJson = (await seed.json()) as { success?: boolean };
  expect(seed.ok(), JSON.stringify(seedJson)).toBeTruthy();

  await selectWorkspace(request, employerToken, MINE_A);
  const needRes = await request.post(`${apiBase}/api/employer/needs`, {
    headers: { Authorization: `Bearer ${employerToken}`, "Idempotency-Key": crypto.randomUUID() },
    data: {
      village_id: 1,
      material_type: "ORE",
      quantity_tons: 8,
      note: "dispatch-board e2e",
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
  await page.goto("/panel/dispatch-board");

  await expect(page.getByTestId("dispatch-board")).toBeVisible({ timeout: 15_000 });
  const pendingCol = page.getByTestId("dispatch-column-PENDING_NEEDS");
  const needCard = pendingCol.getByTestId(`dispatch-need-card-${needId}`);
  await expect(needCard).toBeVisible({ timeout: 15_000 });

  await page.getByTestId(`dispatch-auto-${needId}`).click();

  await expect(page.getByTestId("dispatch-board-toast")).toContainText(/مأموریت #\d+/, {
    timeout: 20_000,
  });

  await expect(needCard).toHaveCount(0, { timeout: 15_000 });
  expect(idempotencySeen).toBe(true);
});
