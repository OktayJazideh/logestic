import 'dart:convert';
import 'dart:async';
import 'package:http/http.dart' as http;

import '../models/api_models.dart';

class ApiClient {
  ApiClient({required this.baseUrl});

  final String baseUrl;
  static const _timeout = Duration(seconds: 15);

  Future<Map<String, dynamic>> _decodeResponse(http.Response res) async {
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
      final msg = body['error']?['message']?.toString() ?? 'خطا در ارتباط با سرور';
      throw ApiException(msg, statusCode: res.statusCode);
    }
    return body;
  }

  Future<http.Response> _send(Future<http.Response> request) async {
    try {
      return await request.timeout(_timeout);
    } on TimeoutException {
      throw const ApiException('زمان پاسخ سرور تمام شد. دوباره تلاش کنید.');
    } catch (_) {
      throw const ApiException('ارتباط با سرور برقرار نشد.');
    }
  }

  Future<OtpRequestResponse> requestOtp(String mobileNumber) async {
    final res = await _send(
      http.post(
      Uri.parse('$baseUrl/api/auth/request-otp'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'mobile_number': mobileNumber}),
    ),
    );
    final body = await _decodeResponse(res);
    return OtpRequestResponse(
      expiresInSeconds: (body['data']?['expires_in_seconds'] as num).toInt(),
      requestId: body['requestId'] as String?,
    );
  }

  Future<AuthVerifyResponse> verifyOtp({
    required String mobileNumber,
    required String otpCode,
  }) async {
    final res = await _send(
      http.post(
      Uri.parse('$baseUrl/api/auth/verify-otp'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'mobile_number': mobileNumber, 'otp_code': otpCode}),
    ),
    );
    final body = await _decodeResponse(res);
    return AuthVerifyResponse(
      accessToken: body['data']['access_token'] as String,
      role: body['data']['role'] as String,
      requestId: body['requestId'] as String?,
    );
  }

  Future<List<Mine>> getMines({required String token}) async {
    final res = await _send(
      http.get(
      Uri.parse('$baseUrl/api/mines'),
      headers: {'authorization': 'Bearer $token'},
    ),
    );
    final body = await _decodeResponse(res);
    final minesJson = body['data']['mines'] as List<dynamic>;
    return minesJson.map((e) => Mine.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> selectMine({required String token, required int mineId}) async {
    final res = await _send(
      http.post(
      Uri.parse('$baseUrl/api/mine/select'),
      headers: {'content-type': 'application/json', 'authorization': 'Bearer $token'},
      body: jsonEncode({'mine_id': mineId}),
    ),
    );
    await _decodeResponse(res);
  }

  Future<List<DriverMission>> getDriverMissions({required String token}) async {
    final res = await _send(
      http.get(
      Uri.parse('$baseUrl/api/driver/missions'),
      headers: {'authorization': 'Bearer $token'},
    ),
    );
    final body = await _decodeResponse(res);
    final missionsJson = body['data']['missions'] as List<dynamic>;
    return missionsJson.map((e) => DriverMission.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<DriverMission> updateMissionStep({
    required String token,
    required int missionId,
    required String step,
  }) async {
    final res = await _send(
      http.post(
      Uri.parse('$baseUrl/api/driver/missions/$missionId/steps'),
      headers: {'content-type': 'application/json', 'authorization': 'Bearer $token'},
      body: jsonEncode({'step': step}),
    ),
    );
    final body = await _decodeResponse(res);
    return DriverMission.fromJson(body['data']['mission'] as Map<String, dynamic>);
  }

  Future<WeighbridgeTicket> getMissionTicket({
    required String token,
    required int missionId,
  }) async {
    final res = await _send(
      http.get(
      Uri.parse('$baseUrl/api/driver/missions/$missionId/ticket'),
      headers: {'authorization': 'Bearer $token'},
    ),
    );
    final body = await _decodeResponse(res);
    return WeighbridgeTicket.fromJson(body['data']['ticket'] as Map<String, dynamic>);
  }
}

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  bool get isUnauthorized => statusCode == 401;

  @override
  String toString() => message;
}