import 'app_config.dart';

/// Resolves API base URLs: HTTPS first, then HTTP (and optional explicit fallback).
class ApiBaseUrlResolver {
  ApiBaseUrlResolver._();

  static String? _pinnedBaseUrl;

  static String get configuredBaseUrl =>
      AppConfig.apiBaseUrl.replaceAll(RegExp(r'/+$'), '');

  /// Working base URL after a successful request (defaults to first candidate).
  static String get activeBaseUrl {
    final candidates = orderedCandidates();
    return _pinnedBaseUrl ?? candidates.first;
  }

  static void pinBaseUrl(String url) {
    _pinnedBaseUrl = url.replaceAll(RegExp(r'/+$'), '');
  }

  static void resetPin() {
    _pinnedBaseUrl = null;
  }

  static List<String> orderedCandidates([String? configured]) {
    final all = candidatesFrom(configured ?? configuredBaseUrl);
    if (_pinnedBaseUrl != null && all.contains(_pinnedBaseUrl)) {
      return [_pinnedBaseUrl!, ...all.where((u) => u != _pinnedBaseUrl)];
    }
    return all;
  }

  static List<String> candidatesFrom(String configured) {
    final trimmed = configured.trim().replaceAll(RegExp(r'/+$'), '');
    final uri = Uri.tryParse(trimmed);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      return [trimmed];
    }

    final out = <String>[];
    void add(String value) {
      final normalized = value.replaceAll(RegExp(r'/+$'), '');
      if (!out.contains(normalized)) out.add(normalized);
    }

    // Always try TLS first, then plain HTTP on the same host/port rules.
    add(_withScheme(uri, 'https'));
    add(_withScheme(uri, 'http'));

    const explicitFallback = String.fromEnvironment(
      'API_BASE_URL_HTTP_FALLBACK',
      defaultValue: '',
    );
    if (explicitFallback.trim().isNotEmpty) {
      add(explicitFallback.trim().replaceAll(RegExp(r'/+$'), ''));
    }

    return out;
  }

  static String _withScheme(Uri uri, String scheme) {
    var port = uri.hasPort ? uri.port : (uri.scheme == 'https' ? 443 : 80);
    if (scheme == 'https' && port == 80) port = 443;
    if (scheme == 'http' && port == 443) port = 80;

    final defaultPort = scheme == 'https' ? 443 : 80;
    if (port == defaultPort) {
      return Uri(scheme: scheme, host: uri.host).toString();
    }
    return Uri(scheme: scheme, host: uri.host, port: port).toString();
  }
}
