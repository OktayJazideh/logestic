import { describe, expect, it } from "vitest";
import { SIMPLE_LABELS } from "./uiLabels";

/** هم‌خوان docs/ux/simple-ui-spec-fa.md §۴ */
const SPEC_LABELS: Record<keyof typeof SIMPLE_LABELS, string> = {
  provisioning: "درخواست کاربر جدید",
  workspace: "انتخاب محل کار",
  dispatch: "تخصیص بار",
  settlement: "تسویه",
  hold: "مبلغ بلوکه‌شده",
  kyc: "تأیید هویت",
  otp: "کد پیامکی",
  geofence: "محدوده معدن / کارخانه",
  netTons: "وزن خالص (تن)",
  mission: "مأموریت",
  load: "بار",
};

describe("SIMPLE_LABELS", () => {
  it("matches UX spec §۴ vocabulary table", () => {
    expect(SIMPLE_LABELS).toEqual(SPEC_LABELS);
  });

  it("has no empty labels", () => {
    for (const value of Object.values(SIMPLE_LABELS)) {
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });
});
