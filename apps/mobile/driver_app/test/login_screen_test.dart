import 'package:flutter_test/flutter_test.dart';
import 'package:mineral_api/mineral_api.dart';

import 'package:driver_app/core/otp_validation.dart';

void main() {
  group('validateMobile', () {
    test('accepts valid 09 mobile', () {
      expect(validateMobile('09123456789'), isNull);
      expect(validateMobile('0912 345 6789'), isNull);
    });

    test('rejects short or invalid prefix', () {
      expect(validateMobile('912345678'), isNotNull);
      expect(validateMobile('08123456789'), isNotNull);
      expect(validateMobile(''), isNotNull);
    });
  });

  group('validateOtp', () {
    test('accepts 6 digits', () {
      expect(validateOtp('123456'), isNull);
    });

    test('rejects wrong length', () {
      expect(validateOtp('12345'), isNotNull);
      expect(validateOtp('1234567'), isNotNull);
    });

    test('rejects non-numeric', () {
      expect(validateOtp('12a456'), isNotNull);
    });
  });

  group('persianApiError', () {
    test('maps otp verification failure', () {
      const err = ApiException(
        'OTP invalid',
        errorCode: 'otp_verification_failed',
      );
      expect(persianApiError(err), contains('نامعتبر'));
    });
  });
}
