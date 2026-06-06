/** Persian copy for login errors — keep in sync with backend authMessages.ts */
export const AUTH_USER_NOT_REGISTERED_MESSAGE =
  "این شماره ثبت نشده. از مدیر معدن یا تعاونی دسترسی بگیرید.";

export const AUTH_USER_INACTIVE_MESSAGE = "حساب غیرفعال است. با پشتیبانی تماس بگیرید.";

export const AUTH_SMS_SEND_FAILED_MESSAGE =
  "پیامک ارسال نشد. چند دقیقه بعد «دریافت کد ورود» را بزنید.";

export function loginErrorMessage(code?: string, fallback?: string): string {
  if (code === "user_not_registered") return AUTH_USER_NOT_REGISTERED_MESSAGE;
  if (code === "user_inactive") return AUTH_USER_INACTIVE_MESSAGE;
  if (code === "sms_send_failed") return AUTH_SMS_SEND_FAILED_MESSAGE;
  return fallback?.trim() || "خطا رخ داد. دوباره امتحان کنید.";
}
