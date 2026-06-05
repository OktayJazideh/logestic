import 'package:flutter/foundation.dart';

import 'app_config.dart';

/// UAT: debug, explicit ENABLE_DEMO_LOGIN, staging IP, or hamsahman.ir during pilot testing.
bool isDemoLoginEnabled({String? apiBaseUrl}) {
  const flag = String.fromEnvironment('ENABLE_DEMO_LOGIN', defaultValue: '');
  if (flag == 'false' || flag == '0') return false;
  if (flag == 'true' || flag == '1') return true;
  if (kDebugMode) return true;
  final base = apiBaseUrl ?? AppConfig.apiBaseUrl;
  if (_isStagingApiHost(base)) return true;
  return _isHamsahmanHost(base);
}

bool _isHamsahmanHost(String url) {
  final uri = Uri.tryParse(url);
  if (uri == null || uri.host.isEmpty) return false;
  final h = uri.host.toLowerCase();
  return h == 'hamsahman.ir' || h == 'www.hamsahman.ir';
}

bool _isStagingApiHost(String url) {
  final uri = Uri.tryParse(url);
  if (uri == null || uri.host.isEmpty) return false;
  return RegExp(r'^\d{1,3}(\.\d{1,3}){3}$').hasMatch(uri.host);
}
