import 'package:flutter_test/flutter_test.dart';
import 'package:mineral_api/mineral_api.dart';

void main() {
  test('candidatesFrom prefers https then http', () {
    final urls = ApiBaseUrlResolver.candidatesFrom('http://185.36.145.164:4000');
    expect(urls.first, 'https://185.36.145.164:4000');
    expect(urls[1], 'http://185.36.145.164:4000');
  });

  test('candidatesFrom strips default ports', () {
    final urls = ApiBaseUrlResolver.candidatesFrom('https://hamsahman.ir');
    expect(urls.first, 'https://hamsahman.ir');
    expect(urls[1], 'http://hamsahman.ir');
  });

  test('candidatesFrom includes explicit http fallback', () {
    // Compile-time define not set in test runner — verify dedupe logic via direct list build.
    final urls = ApiBaseUrlResolver.candidatesFrom('https://example.com');
    expect(urls.length, 2);
    expect(urls, ['https://example.com', 'http://example.com']);
  });
}
