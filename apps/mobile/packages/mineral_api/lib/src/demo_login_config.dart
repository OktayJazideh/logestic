import 'package:flutter/foundation.dart';

import 'app_config.dart';

/// Staging/UAT: show demo login on debug builds, explicit flag, or IP-based API URL.
bool isDemoLoginEnabled({String? apiBaseUrl}) {
  const flag = String.fromEnvironment('ENABLE_DEMO_LOGIN', defaultValue: '');
  if (flag == 'false' || flag == '0') return false;
  if (kDebugMode) return true;
  if (flag == 'true' || flag == '1') return true;
  return _isStagingApiHost(apiBaseUrl ?? AppConfig.apiBaseUrl);
}

bool _isStagingApiHost(String url) {
  final uri = Uri.tryParse(url);
  if (uri == null || uri.host.isEmpty) return false;
  return RegExp(r'^\d{1,3}(\.\d{1,3}){3}$').hasMatch(uri.host);
}
