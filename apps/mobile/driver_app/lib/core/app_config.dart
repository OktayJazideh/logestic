class AppConfig {
  // You can override this at build/run time:
  // flutter run --dart-define=API_BASE_URL=http://192.168.1.10:4000
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:4000',
  );
}

