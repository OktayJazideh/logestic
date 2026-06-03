const CODE_FA: Record<string, string> = {
  mobile_taken: "این شماره موبایل قبلاً در سیستم ثبت شده است.",
  mobile_pending: "برای این موبایل درخواست در انتظار تأیید وجود دارد.",
  national_id_taken: "این کد ملی قبلاً ثبت شده است.",
  national_id_pending: "برای این کد ملی درخواست در انتظار تأیید وجود دارد.",
  national_id_unavailable: "کد ملی در سیستم موجود است و قابل استفاده نیست.",
  invalid_national_id: "کد ملی نامعتبر است.",
  invalid_mobile: "شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.",
  cooperative_required: "شناسه تعاونی برای این نقش الزامی است.",
  mine_required: "ابتدا فضای کاری (معدن) را انتخاب کنید.",
  self_delete: "نمی‌توانید حساب خود را حذف کنید.",
};

export function apiErrorMessageFa(code?: string, fallback?: string): string {
  if (code && CODE_FA[code]) return CODE_FA[code];
  return fallback ?? "خطایی رخ داد.";
}
