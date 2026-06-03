import 'api_exception.dart';

/// User-facing auth error copy (matches backend `authMessages.ts`).
const authUserNotRegisteredMessage =
    'شماره موبایل شما در سامانه ثبت نشده است. '
    'برای دسترسی با واحد مربوط (تعاونی، عملیات معدن یا پشتیبانی پلتفرم) هماهنگ کنید.';

const authUserInactiveMessage =
    'حساب کاربری شما غیرفعال است. لطفاً با واحد مربوط تماس بگیرید.';

String authErrorMessage(Object error) {
  if (error is ApiException) {
    switch (error.errorCode) {
      case 'user_not_registered':
        return authUserNotRegisteredMessage;
      case 'user_inactive':
        return authUserInactiveMessage;
      case 'otp_verification_failed':
        return 'کد وارد شده نامعتبر یا منقضی شده است.';
      case 'rate_limited':
        return 'درخواست‌های زیاد. لطفاً چند دقیقه بعد دوباره تلاش کنید.';
      case 'user_not_registered':
        return authUserNotRegisteredMessage;
      case 'user_inactive':
        return authUserInactiveMessage;
      case 'sms_send_failed':
        return 'ارسال پیامک با خطا مواجه شد. چند دقیقه بعد دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.';
    }
    return error.message;
  }
  return 'خطا در ارتباط با سرور. دوباره تلاش کنید.';
}
