import 'package:mineral_api/mineral_api.dart';

import '../models/api_models.dart';
import '../models/geofence_config.dart';

class DriverApiClient extends MineralApiClient {
  DriverApiClient({required super.baseUrl, super.httpClient});

  Future<DriverMe> getDriverMe({required String token}) => super.getDriverMe(token: token);

  Future<List<Workspace>> getWorkspaces({required String token}) => super.getWorkspaces(token: token);

  Future<void> selectWorkspace({
    required String token,
    required int mineId,
    int? cooperativeId,
    String? membershipKind,
  }) =>
      super.selectWorkspace(
        token: token,
        mineId: mineId,
        cooperativeId: cooperativeId,
        membershipKind: membershipKind,
      );

  Future<DriverDashboard> getDriverDashboard({required String token}) async {
    final body = await getJson('/api/driver/dashboard', token: token);
    return DriverDashboard.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<List<DriverMission>> getDriverMissions({required String token}) async {
    final body = await getJson('/api/driver/missions', token: token);
    final missionsJson = body['data']['missions'] as List<dynamic>;
    return missionsJson
        .map((e) => DriverMission.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// WF-INTRANSIT-1 — single mission with mine/factory coords.
  Future<DriverMission> getDriverMission({
    required String token,
    required int missionId,
  }) async {
    final body = await getJson('/api/driver/missions/$missionId', token: token);
    return DriverMission.fromJson(body['data']['mission'] as Map<String, dynamic>);
  }

  /// Driver FSM advance (idempotent). API path: `POST /driver/missions/:id/steps`.
  Future<GeofenceConfig> getMissionGeofence({
    required String token,
    required int missionId,
    required String target,
  }) async {
    final body = await getJson(
      '/api/driver/missions/$missionId/geofence?target=$target',
      token: token,
    );
    return GeofenceConfig.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<DriverMission> advanceMission({
    required String token,
    required int missionId,
    required String step,
    String? idempotencyKey,
    double? latitude,
    double? longitude,
    double? accuracyM,
    double? distanceM,
    String? receiptPhotoUrl,
    String? receiptPhotoBase64,
  }) async {
    final body = await postJson(
      '/api/driver/missions/$missionId/steps',
      token: token,
      body: {
        'step': step,
        if (latitude != null) 'latitude': latitude,
        if (longitude != null) 'longitude': longitude,
        if (accuracyM != null) 'accuracy_m': accuracyM,
        if (distanceM != null) 'distance_m': distanceM,
        if (receiptPhotoUrl != null) 'receipt_photo_url': receiptPhotoUrl,
        if (receiptPhotoBase64 != null) 'receipt_photo_base64': receiptPhotoBase64,
      },
      idempotencyKey: idempotencyKey,
    );
    return DriverMission.fromJson(body['data']['mission'] as Map<String, dynamic>);
  }

  Future<DriverMission> updateMissionStep({
    required String token,
    required int missionId,
    required String step,
    String? idempotencyKey,
  }) =>
      advanceMission(
        token: token,
        missionId: missionId,
        step: step,
        idempotencyKey: idempotencyKey,
      );

  Future<WeighbridgeTicket?> getMissionTicket({
    required String token,
    required int missionId,
  }) async {
    final body = await getJson('/api/driver/missions/$missionId/ticket', token: token);
    final raw = body['data']?['ticket'];
    if (raw == null) return null;
    return WeighbridgeTicket.fromJson(raw as Map<String, dynamic>);
  }

  /// WF-WB-READ-1: read-only weighbridge status (GET only).
  Future<DriverWeighbridgeStatus> getWeighbridgeStatus({
    required String token,
    required int missionId,
  }) async {
    final body = await getJson(
      '/api/driver/missions/$missionId/weighbridge-status',
      token: token,
    );
    return DriverWeighbridgeStatus.fromJson(body['data'] as Map<String, dynamic>);
  }
}
