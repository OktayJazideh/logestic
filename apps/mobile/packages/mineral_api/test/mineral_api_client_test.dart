import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mineral_api/mineral_api.dart';

void main() {
  test('newIdempotencyKey returns UUID v4 shape', () {
    final key = MineralApiClient.newIdempotencyKey();
    expect(
      RegExp(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      ).hasMatch(key),
      isTrue,
    );
  });

  test('decodeResponse throws on error envelope', () async {
    final client = MineralApiClient(baseUrl: 'http://example.com');
    expect(
      () => client.decodeResponse(
        http.Response(
          '{"success":false,"error":{"code":"x","message":"خطا"}}',
          400,
        ),
      ),
      throwsA(isA<ApiException>()),
    );
    client.close();
  });
}
