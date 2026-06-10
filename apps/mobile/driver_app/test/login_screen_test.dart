import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mineral_api/mineral_api.dart';
import 'package:mineral_ui/mineral_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:driver_app/core/driver_api_client.dart';
import 'package:driver_app/core/otp_validation.dart';
import 'package:driver_app/ui/screens/login_screen.dart';

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

  group('LoginScreen', () {
    testWidgets('shows password login option on mobile step', (tester) async {
      SharedPreferences.setMockInitialValues({});
      await tester.pumpWidget(
        MaterialApp(
          theme: MineralTheme.lightTheme,
          home: LoginScreen(
            api: DriverApiClient(baseUrl: 'http://test'),
            sessionStore: SessionStore(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('ورود با نام کاربری و رمز'), findsOneWidget);
    });
  });
}
