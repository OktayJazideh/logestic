/** برچسب‌های فارسی برای enumها و کدهای API — فقط نمایش UI */

export function labelFa(map: Record<string, string>, code: string | undefined | null): string {
  if (!code) return "—";
  return map[code] ?? code;
}

export const WEIGHBRIDGE_STATUS_FA: Record<string, string> = {
  PENDING_EMPTY: "در انتظار وزن خالی",
  EMPTY_REGISTERED: "وزن خالی ثبت شد",
  LOADED_REGISTERED: "وزن پر ثبت شد",
  PENDING_HOLD: "در انتظار نگهداری",
  APPROVED: "تأییدشده",
  REJECTED: "ردشده",
  ADJUSTED: "اصلاح‌شده",
};

export const MANUAL_REASON_FA: Record<string, string> = {
  SCALE_DOWN: "خرابی باسکول",
  NETWORK: "قطع شبکه",
  ENTRY_SOURCE_MANUAL: "ثبت دستی",
  OTHER: "سایر",
};

export const PAYMENT_STATE_FA: Record<string, string> = {
  HELD: "نگهداری شده",
  RELEASED: "آزاد شده",
  REVERSED: "برگشت خورده",
  NORMAL: "عادی",
};

export const STATEMENT_STATUS_FA: Record<string, string> = {
  DRAFT: "پیش‌نویس",
  PENDING_REVIEW: "در انتظار بررسی",
  APPROVED: "تأییدشده",
  LOCKED: "قفل‌شده",
  PAID: "پرداخت‌شده",
};

export const MISSION_STATUS_FA: Record<string, string> = {
  CREATED: "ایجاد شده",
  ASSIGNED: "تخصیص‌یافته",
  IN_PROGRESS: "در حال انجام",
  DELIVERED: "تحویل‌شده",
  VERIFIED: "تأیید نهایی",
};

export const MATERIAL_TYPE_FA: Record<string, string> = {
  ORE: "سنگ معدن",
  WASTE: "باطله",
};

export const OPERATION_TYPE_FA: Record<string, string> = {
  HAUL_TONNAGE: "حمل تنی",
  HOURLY_EQUIPMENT: "کار ساعتی تجهیز",
};

export const KYC_STATUS_FA: Record<string, string> = {
  PENDING: "در انتظار",
  APPROVED: "تأییدشده",
  REJECTED: "ردشده",
  SUSPENDED: "معلق",
};

export const ENTRY_SOURCE_FA: Record<string, string> = {
  SCALE: "باسکول",
  MANUAL: "دستی",
  COOP_OPERATOR: "اپراتور تعاونی",
  OPERATION_ADMIN: "مدیر عملیات",
};
