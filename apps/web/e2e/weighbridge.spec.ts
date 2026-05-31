import { expect, test } from "@playwright/test";
import { loginViaUi } from "./helpers/auth";
import { loginApi, selectWorkspace } from "./helpers/api";
import { advanceDriverToDelivered, seedMissionWithTicket } from "./helpers/weighbridge";

test("operator ثبت وزن → coop admin approve", async ({ page, request }) => {
  const { missionId, ticketId } = await seedMissionWithTicket(request);

  await loginViaUi(page, "09000000111", request);
  await page.goto("/panel/weighbridge");

  const mineSelect = page.getByTestId("mine-select");
  await expect(mineSelect.locator("option")).not.toHaveCount(1, { timeout: 15_000 });
  await mineSelect.selectOption({ index: 1 });
  await page.getByTestId("mine-apply").click();
  await expect(page.getByText(/معدن فعال در سشن/)).toBeVisible();

  await page.getByTestId(`wb-ticket-row-${ticketId}`).click();
  await expect(page.getByTestId("wb-detail-panel")).toBeVisible();

  await page.getByTestId("wb-empty-kg").fill("10000");
  await page.getByTestId("wb-loaded-kg").fill("15500");
  await page.getByTestId("wb-submit-weights").click();

  await expect(page.getByTestId("wb-action-msg")).toContainText("وزن ثبت شد", { timeout: 15_000 });
  await expect(page.getByTestId("wb-ticket-status")).toHaveText("LOADED_REGISTERED");
  await expect(page.getByTestId("wb-net-weight")).toHaveValue("5500");

  await advanceDriverToDelivered(request, missionId);

  const coopAdminToken = await loginApi(request, "09000000001");
  await selectWorkspace(request, coopAdminToken, 1, { cooperativeId: 1, membership_kind: "COMMUNITY" });
  await page.evaluate((token) => localStorage.setItem("auth_token", token), coopAdminToken);
  await page.goto("/panel/weighbridge");

  await mineSelect.selectOption({ index: 1 });
  await page.getByTestId("mine-apply").click();
  await expect(page.getByText(/معدن فعال در سشن/)).toBeVisible();

  await page.getByTestId(`wb-ticket-row-${ticketId}`).click();
  await expect(page.getByTestId("wb-ticket-status")).toHaveText("LOADED_REGISTERED");
  await page.getByTestId("wb-approve").click();

  await expect(page.getByTestId("wb-action-msg")).toContainText("تأیید شد", { timeout: 15_000 });
  await expect(page.getByTestId("wb-ticket-status")).toHaveText("APPROVED");

  await expect(page.getByTestId(`wb-ticket-row-${ticketId}`)).toContainText(String(missionId));
});
