import { expect, test } from "@playwright/test";
import { loginViaUi } from "./helpers/auth";

test("Login OTP → Panel", async ({ page, request }) => {
  await loginViaUi(page, "09000000000", request);
  await expect(page.getByRole("heading", { name: "داشبورد" })).toBeVisible();
});
