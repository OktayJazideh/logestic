/** Persian copy for login errors — keep in sync with backend authMessages.ts */
export const AUTH_USER_NOT_REGISTERED_MESSAGE =
  "شماره موبایل شما در سامانه ثبت نشده است. برای دسترسی با واحد مربوط (تعاونی، عملیات معدن یا پشتیبانی پلتفرم) هماهنگ کنید.";

export const AUTH_USER_INACTIVE_MESSAGE =
  "حساب کاربری شما غیرفعال است. لطفاً با واحد مربوط تماس بگیرید.";

export function loginErrorMessage(code?: string, fallback?: string): string {
  if (code === "user_not_registered") return AUTH_USER_NOT_REGISTERED_MESSAGE;
  if (code === "user_inactive") return AUTH_USER_INACTIVE_MESSAGE;
  return fallback ?? "خطا در ورود. دوباره تلاش کنید.";
}
