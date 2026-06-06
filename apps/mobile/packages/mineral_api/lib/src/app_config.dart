class AppConfig {
  // Override at build/run time:
  // flutter run --dart-define=API_BASE_URL=https://hamsahman.ir
  // Optional extra HTTP target when TLS is not ready:
  // --dart-define=API_BASE_URL_HTTP_FALLBACK=http://185.36.145.164
  // Client tries HTTPS first, then HTTP (same host, then optional fallback).
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:4000',
  );

  static const String driverSupportPhone = String.fromEnvironment(
    'DRIVER_SUPPORT_PHONE',
    defaultValue: '021-91000000',
  );
}
