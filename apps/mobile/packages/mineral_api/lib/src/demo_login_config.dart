import 'package:flutter/foundation.dart';

import 'api_base_url_resolver.dart';
import 'app_config.dart';

/// UAT: debug, explicit ENABLE_DEMO_LOGIN=true, or staging IP API — never auto on production domain.
bool isDemoLoginEnabled({String? apiBaseUrl}) {
  const flag = String.fromEnvironment('ENABLE_DEMO_LOGIN', defaultValue: '');
  if (flag == 'false' || flag == '0') return false;
  if (flag == 'true' || flag == '1') return true;
  if (kDebugMode) return true;
  final bases = apiBaseUrl != null
      ? ApiBaseUrlResolver.candidatesFrom(apiBaseUrl)
      : ApiBaseUrlResolver.candidatesFrom(AppConfig.apiBaseUrl);
  for (final base in bases) {
    if (_isStagingApiHost(base)) return true;
  }
  return false;
}

bool _isStagingApiHost(String url) {
  final uri = Uri.tryParse(url);
  if (uri == null || uri.host.isEmpty) return false;
  return RegExp(r'^\d{1,3}(\.\d{1,3}){3}$').hasMatch(uri.host);
}
