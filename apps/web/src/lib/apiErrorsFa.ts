const CODE_FA: Record<string, string> = {
  mobile_taken: "این شماره موبایل قبلاً در سیستم ثبت شده است.",
  mobile_pending: "برای این موبایل درخواست در انتظار تأیید وجود دارد.",
  national_id_taken: "این کد ملی قبلاً ثبت شده است.",
  national_id_pending: "برای این کد ملی درخواست در انتظار تأیید وجود دارد.",
  national_id_unavailable: "کد ملی در سیستم موجود است و قابل استفاده نیست.",
  invalid_national_id: "کد ملی نامعتبر است.",
  invalid_mobile: "شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.",
  invalid_persian_name: "نام باید فارسی و حداقل ۲ کاراکتر باشد.",
  iban_taken: "این شماره شبا قبلاً ثبت شده است.",
  invalid_iban: "شماره شبا نامعتبر است.",
  cooperative_required: "کاربر تعاونی به هیچ تعاونی متصل نیست یا شناسه تعاونی الزامی است.",
  mine_required: "ابتدا فضای کاری (معدن) را از منوی بالا انتخاب کنید.",
  self_delete: "نمی‌توانید حساب خود را حذف کنید.",
  schema_not_ready:
    "پایگاه‌داده به‌روز نیست. روی سرور دستور prisma migrate deploy (migration 0045) را اجرا کنید و API را restart کنید.",
  internal_error:
    "خطای داخلی سرور. روی VPS حتماً بعد از migrate این را اجرا کنید: npx prisma generate && npm run build && systemctl restart logestic-api",
  workspace_access_denied: "دسترسی به فضای کاری این معدن برای شما مجاز نیست.",
  endpoint_not_found:
    "نسخه API روی سرور قدیمی است. در VPS: git pull && cd apps/backend && npm run build && systemctl restart logestic-api",
  invalid_response: "پاسخ نامعتبر از سرور — احتمالاً API به‌روز نشده است.",
  forbidden: "دسترسی به این عملیات ندارید.",
};

export function apiErrorMessageFa(code?: string, fallback?: string): string {
  if (code && CODE_FA[code]) return CODE_FA[code];
  return fallback ?? "خطایی رخ داد.";
}
