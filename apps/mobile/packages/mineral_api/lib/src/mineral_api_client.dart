import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:http/http.dart' as http;

import 'api_exception.dart';
import 'models/auth_models.dart';
import 'models/driver_models.dart';
import 'models/workspace_models.dart';

/// Base HTTP client for Mineral Haul API (`{ success, data, error }` envelope).
class MineralApiClient {
  MineralApiClient({required this.baseUrl, http.Client? httpClient})
      : _http = httpClient ?? http.Client();

  final String baseUrl;
  final http.Client _http;
  static const _timeout = Duration(seconds: 15);

  static String newIdempotencyKey() {
    final r = Random.secure();
    final b = List<int>.generate(16, (_) => r.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    String h(int i) => b[i].toRadixString(16).padLeft(2, '0');
    return '${h(0)}${h(1)}${h(2)}${h(3)}-${h(4)}${h(5)}-'
        '${h(6)}${h(7)}-${h(8)}${h(9)}-${h(10)}${h(11)}${h(12)}${h(13)}${h(14)}${h(15)}';
  }

  Map<String, String> authHeaders(String token, {String? idempotencyKey}) => {
        'content-type': 'application/json',
        'authorization': 'Bearer $token',
        if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey,
      };

  Map<String, String> postHeaders(String token, {String? idempotencyKey}) => {
        ...authHeaders(token),
        'Idempotency-Key': idempotencyKey ?? newIdempotencyKey(),
      };

  Future<Map<String, dynamic>> decodeResponse(http.Response res) async {
    final raw = res.body.trim();
    if (raw.isEmpty) {
      throw const ApiException('پاسخ خالی از سرور دریافت شد.');
    }
    Map<String, dynamic> body;
    try {
      body = jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      throw const ApiException('پاسخ نامعتبر از سرور دریافت شد.');
    }

    if (res.statusCode >= 400 || body['success'] != true) {
      final err = body['error'];
      final msg = err?['message']?.toString() ?? 'خطا در ارتباط با سرور';
      final code = err?['code']?.toString();
      throw ApiException(
        msg,
        statusCode: res.statusCode,
        errorCode: code,
      );
    }
    return body;
  }

  Future<http.Response> send(Future<http.Response> request) async {
    try {
      return await request.timeout(_timeout);
    } on TimeoutException {
      throw const ApiException(
        'زمان پاسخ سرور تمام شد. دوباره تلاش کنید.',
        isNetworkError: true,
      );
    } on SocketException {
      throw const ApiException(
        'ارتباط با سرور برقرار نشد.',
        isNetworkError: true,
      );
    } on http.ClientException {
      throw const ApiException(
        'ارتباط با سرور برقرار نشد.',
        isNetworkError: true,
      );
    } catch (_) {
      throw const ApiException(
        'ارتباط با سرور برقرار نشد.',
        isNetworkError: true,
      );
    }
  }

  Future<Map<String, dynamic>> getJson(String path, {required String token}) async {
    final res = await send(
      _http.get(
        Uri.parse('$baseUrl$path'),
        headers: authHeaders(token),
      ),
    );
    return decodeResponse(res);
  }

  Future<Map<String, dynamic>> postJson(
    String path, {
    required String token,
    Map<String, dynamic>? body,
    String? idempotencyKey,
  }) async {
    final res = await send(
      _http.post(
        Uri.parse('$baseUrl$path'),
        headers: postHeaders(token, idempotencyKey: idempotencyKey),
        body: jsonEncode(body ?? {}),
      ),
    );
    return decodeResponse(res);
  }

  Future<Map<String, dynamic>> patchJson(
    String path, {
    required String token,
    Map<String, dynamic>? body,
    String? idempotencyKey,
  }) async {
    final res = await send(
      _http.patch(
        Uri.parse('$baseUrl$path'),
        headers: postHeaders(token, idempotencyKey: idempotencyKey),
        body: jsonEncode(body ?? {}),
      ),
    );
    return decodeResponse(res);
  }

  Future<OtpRequestResponse> requestOtp(String mobileNumber) async {
    final res = await send(
      _http.post(
        Uri.parse('$baseUrl/api/auth/request-otp'),
        headers: {'content-type': 'application/json'},
        body: jsonEncode({'mobile_number': mobileNumber}),
      ),
    );
    final body = await decodeResponse(res);
    return OtpRequestResponse(
      expiresInSeconds: (body['data']?['expires_in_seconds'] as num).toInt(),
      requestId: body['requestId'] as String?,
    );
  }

  Future<AuthVerifyResponse> verifyOtp({
    required String mobileNumber,
    required String otpCode,
  }) async {
    final res = await send(
      _http.post(
        Uri.parse('$baseUrl/api/auth/verify-otp'),
        headers: {'content-type': 'application/json'},
        body: jsonEncode({'mobile_number': mobileNumber, 'otp_code': otpCode}),
      ),
    );
    final body = await decodeResponse(res);
    return AuthVerifyResponse(
      accessToken: body['data']['access_token'] as String,
      role: body['data']['role'] as String,
      requestId: body['requestId'] as String?,
    );
  }

  Future<AuthMe> getMe({required String token}) async {
    final body = await getJson('/api/auth/me', token: token);
    return AuthMe.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<DriverMe> getDriverMe({required String token}) async {
    final body = await getJson('/api/driver/me', token: token);
    return DriverMe.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<List<Workspace>> getWorkspaces({required String token}) async {
    final body = await getJson('/api/workspaces', token: token);
    final list = body['data']['workspaces'] as List<dynamic>;
    return list.map((e) => Workspace.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> selectWorkspace({
    required String token,
    required int mineId,
    int? cooperativeId,
    String? membershipKind,
  }) async {
    await postJson(
      '/api/workspaces/select',
      token: token,
      body: {
        'mine_id': mineId,
        if (cooperativeId != null) 'cooperative_id': cooperativeId,
        if (membershipKind != null) 'membership_kind': membershipKind,
      },
    );
  }

  void close() => _http.close();
}
