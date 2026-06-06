/** برچسب‌های فارسی برای enumها و کدهای API — فقط نمایش UI */

/** واژگان ساده UI — هم‌خوان docs/ux/simple-ui-spec-fa.md §۴ */
export const SIMPLE_LABELS = {
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
} as const;

export type SimpleLabelKey = keyof typeof SIMPLE_LABELS;

export function simpleLabel(key: SimpleLabelKey): string {
  return SIMPLE_LABELS[key];
}

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
  ACCEPTED: "پذیرفته‌شده",
  ARRIVED: "رسیده به مبدأ",
  LOADED: "بارگیری شده",
  IN_TRANSIT: "در مسیر",
  IN_PROGRESS: "در حال انجام",
  DELIVERED: "تحویل‌شده",
  VERIFIED: "تأیید نهایی",
  SETTLED: "تسویه‌شده",
  CANCELLED: "لغوشده",
  LOADING: "در حال بارگیری",
  AWAITING_WB: "در انتظار باسکول",
};

export const NEED_STATUS_FA: Record<string, string> = {
  PENDING: "در انتظار تخصیص",
  DISPATCHED: "تخصیص‌شده",
  COMPLETED: "انجام‌شده",
  CANCELLED: "لغوشده",
};

export const DISPATCH_COLUMN_FA: Record<string, string> = {
  AWAITING_WB: "در انتظار باسکول",
  ASSIGNED: "تخصیص‌شده",
  IN_PROGRESS: "در جریان",
  VERIFIED: "تأییدشده",
};

export const MATERIAL_TYPE_FA: Record<string, string> = {
  ORE: "سنگ معدن",
  WASTE: "باطله",
};

export const OPERATION_TYPE_FA: Record<string, string> = {
  HAUL_TONNAGE: "حمل تنی",
  HOURLY_EQUIPMENT: "کار ساعتی تجهیز",
  TONNAGE: "تنی",
  HOURLY: "ساعتی",
};

export const KYC_STATUS_FA: Record<string, string> = {
  PENDING: "در انتظار",
  APPROVED: "تأییدشده",
  REJECTED: "ردشده",
  SUSPENDED: "معلق",
};

export const ENTITY_TYPE_FA: Record<string, string> = {
  household: "خانوار",
  driver: "راننده",
  fleet_owner: "مالک ناوگان",
  vehicle: "وسیله",
  cooperative: "تعاونی",
  user: "کاربر",
  membership_objection: "اعتراض عضویت",
  kyc_change: "تغییر احراز هویت",
  mission_payment: "پرداخت مأموریت",
  weighbridge_ticket: "تیکت باسکول",
  weighbridge_adjustment: "اصلاح باسکول",
  rate_card: "کارت نرخ",
  finance_rule: "قانون مالی",
  operation_need: "نیاز عملیات",
  domain_event: "رویداد سیستم",
  hourly_work_log: "کارکرد ساعتی",
  AUTH: "احراز هویت",
};

export const ENTRY_SOURCE_FA: Record<string, string> = {
  SCALE: "باسکول",
  MANUAL: "دستی",
  COOP_OPERATOR: "اپراتور تعاونی",
  OPERATION_ADMIN: "مدیر عملیات",
};

export const RULE_SCOPE_FA: Record<string, string> = {
  GLOBAL: "سراسری",
  MINE: "معدن",
  COOPERATIVE: "تعاونی",
};

export const RULE_STATUS_FA: Record<string, string> = {
  ACTIVE: "فعال",
  ARCHIVED: "بایگانی",
};

export const RULE_KEY_FA: Record<string, string> = {
  "split.owner": "سهم مالک ناوگان",
  "split.platform": "سهم پلتفرم",
  "community.rial_per_verified_ton": "مبلغ مشارکت جامعه (ریال/تن)",
  "weighbridge.threshold": "آستانه اختلاف باسکول",
  "settlement.period_days": "دوره تسویه (روز)",
  "settlement.owner_period_days": "دوره تسویه مالک (روز)",
  "reverse.window_hours": "پنجره برگشت (ساعت)",
  "pool.remainder.target": "مقصد باقیمانده استخر",
  "geofence.radius_m": "شعاع ژئوفنس (متر)",
  "geofence.factory": "مختصات کارخانه (ژئوفنس)",
};

export function ruleKeyLabelFa(key: string): string {
  return RULE_KEY_FA[key] ?? key;
}

export const RATE_CARD_STATUS_FA: Record<string, string> = {
  DRAFT: "پیش‌نویس",
  ACTIVE: "فعال",
  ARCHIVED: "بایگانی",
};

export const SETTLEMENT_BATCH_STATUS_FA: Record<string, string> = {
  DRAFT: "پیش‌نویس",
  CALCULATED: "محاسبه‌شده",
  LOCKED: "قفل‌شده",
  READY: "آماده پرداخت",
  IN_BANK_QUEUE: "در صف بانک",
  SETTLED: "تسویه‌شده",
};

export const COMMUNITY_POOL_STATUS_FA: Record<string, string> = {
  OPEN: "باز",
  SNAPSHOT_LOCKED: "اسنپ‌شات قفل",
  DISTRIBUTED: "توزیع‌شده",
};

export const AUDIT_ACTION_FA: Record<string, string> = {
  CREATE: "ایجاد",
  UPDATE: "ویرایش",
  DELETE: "حذف",
  APPROVE: "تأیید",
  REJECT: "رد",
  LOCK: "قفل",
  UNLOCK: "باز کردن قفل",
  SIGN: "امضا",
  ACTIVATE: "فعال‌سازی",
  ARCHIVE: "بایگانی",
  ACTIVATED: "فعال شد",
  ARCHIVED: "بایگانی شد",
  SOFT_DELETED: "حذف نرم",
  RESTORED: "بازیابی",
  LOGIN: "ورود",
  LOGOUT: "خروج",
};

export const CONTRACT_DISPLAY_STATUS_FA: Record<string, string> = {
  ACTIVE: "فعال",
  DRAFT: "پیش‌نویس",
  EXPIRED: "منقضی",
};
