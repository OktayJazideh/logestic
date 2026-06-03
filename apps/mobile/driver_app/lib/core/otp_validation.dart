import 'package:mineral_api/mineral_api.dart';

/// Normalizes Iranian mobile input (digits only, leading 0 preserved).
String normalizeMobile(String input) =>
    input.replaceAll(RegExp(r'[\s\-]'), '').trim();

String? validateMobile(String input) {
  final mobile = normalizeMobile(input);
  if (mobile.isEmpty) return 'شماره موبایل را وارد کنید.';
  if (!RegExp(r'^09\d{9}$').hasMatch(mobile)) {
    return 'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.';
  }
  return null;
}

String? validateOtp(String otp) {
  final code = otp.trim();
  if (code.length != 6) return 'کد OTP باید ۶ رقم باشد.';
  if (!RegExp(r'^\d{6}$').hasMatch(code)) {
    return 'کد OTP باید فقط عدد باشد.';
  }
  return null;
}

String persianApiError(Object error) => authErrorMessage(error);
