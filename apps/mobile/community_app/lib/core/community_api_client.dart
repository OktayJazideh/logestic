import 'package:mineral_api/mineral_api.dart';

import '../models/community_models.dart';
import '../models/hourly_models.dart';

class CommunityApiClient extends MineralApiClient {
  CommunityApiClient({required super.baseUrl, super.httpClient});

  Future<HouseholdProfile?> getHouseholdMe({required String token}) async {
    try {
      final body = await getJson('/api/households/me', token: token);
      return HouseholdProfile.fromJson(body['data']['household'] as Map<String, dynamic>);
    } on ApiException catch (e) {
      if (e.statusCode == 404) return null;
      rethrow;
    }
  }

  Future<List<VillageOption>> getVillages({required String token, required int mineId}) async {
    final body = await getJson('/api/villages?mine_id=$mineId', token: token);
    final list = body['data']['villages'] as List<dynamic>;
    return list.map((e) => VillageOption.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<HouseholdProfile> registerHousehold({
    required String token,
    required int villageId,
    required String nationalId,
    required String bankIban,
    required String headName,
  }) async {
    final body = await postJson(
      '/api/households/register',
      token: token,
      body: {
        'village_id': villageId,
        'national_id': nationalId,
        'bank_iban': bankIban,
        'head_name': headName,
      },
    );
    return HouseholdProfile.fromJson(body['data']['household'] as Map<String, dynamic>);
  }

  Future<HouseholdProfile> patchHouseholdIban({
    required String token,
    required String bankIban,
    required String reason,
  }) async {
    final body = await patchJson(
      '/api/households/me/iban',
      token: token,
      body: {'bank_iban': bankIban, 'reason': reason},
    );
    return HouseholdProfile.fromJson(body['data']['household'] as Map<String, dynamic>);
  }

  Future<HouseholdWalletView> getHouseholdWallet({required String token}) async {
    final body = await getJson('/api/wallet/household', token: token);
    final data = body['data'] as Map<String, dynamic>;
    return HouseholdWalletView.fromJson(data);
  }

  Future<HouseholdSharesView> getHouseholdShares({required String token, String? period}) async {
    final query = period != null && period.isNotEmpty ? '?period=$period' : '';
    final body = await getJson('/api/household/shares$query', token: token);
    return HouseholdSharesView.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<HouseholdPoolStatusView> getHouseholdPoolStatus({required String token, String? period}) async {
    final query = period != null && period.isNotEmpty ? '?period=$period' : '';
    final body = await getJson('/api/household/pool-status$query', token: token);
    return HouseholdPoolStatusView.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<List<CoopMember>> getMembers({required String token}) async {
    final body = await getJson('/api/coop/members', token: token);
    final list = body['data']['members'] as List<dynamic>;
    return list.map((e) => CoopMember.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<KycInboxPage> getKycInboxPage({
    required String token,
    required String status,
    int page = 1,
    int limit = 20,
  }) async {
    final query = Uri(queryParameters: {
      'status': status,
      'page': '$page',
      'limit': '$limit',
      'sort': 'created_at:desc',
    }).query;
    final body = await getJson('/api/coop/kyc/inbox?$query', token: token);
    return KycInboxPage.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<void> approveKycEntity({
    required String token,
    required String entityType,
    required int id,
  }) async {
    final segment = kycEntityPathSegment(entityType);
    await postJson('/api/coop/$segment/$id/approve', token: token);
  }

  Future<void> rejectKycEntity({
    required String token,
    required String entityType,
    required int id,
    required String reason,
  }) async {
    final segment = kycEntityPathSegment(entityType);
    await postJson(
      '/api/coop/$segment/$id/reject',
      token: token,
      body: {'reason': reason},
    );
  }

  Future<void> requestKycCorrection({
    required String token,
    required String entityType,
    required int id,
    required String reason,
  }) async {
    final segment = kycEntityPathSegment(entityType);
    await postJson(
      '/api/coop/$segment/$id/request-correction',
      token: token,
      body: {'reason': reason},
    );
  }

  @Deprecated('Use getKycInboxPage')
  Future<KycInbox> getKycInbox({required String token}) async {
    final page = await getKycInboxPage(token: token, status: 'PENDING');
    return KycInbox(households: page.items);
  }

  Future<void> approveHousehold({required String token, required int householdId}) async {
    await approveKycEntity(token: token, entityType: 'household', id: householdId);
  }

  Future<void> rejectHousehold({
    required String token,
    required int householdId,
    required String reason,
  }) async {
    await rejectKycEntity(
      token: token,
      entityType: 'household',
      id: householdId,
      reason: reason,
    );
  }

  Future<List<MembershipObjection>> getObjections({required String token}) async {
    final body = await getJson('/api/coop/objections', token: token);
    final list = body['data']['objections'] as List<dynamic>;
    return list
        .map((e) => MembershipObjection.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<MembershipObjection> createObjection({
    required String token,
    required int householdId,
    required String reason,
    String? reporterName,
    String? reporterMobile,
  }) async {
    final body = await postJson(
      '/api/coop/objections',
      token: token,
      body: {
        'household_id': householdId,
        'reason': reason,
        if (reporterName != null && reporterName.isNotEmpty) 'reporter_name': reporterName,
        if (reporterMobile != null && reporterMobile.isNotEmpty) 'reporter_mobile': reporterMobile,
      },
    );
    return MembershipObjection.fromJson(body['data']['objection'] as Map<String, dynamic>);
  }

  Future<OperatorHourlyContext> getOperatorHourlyContext({required String token}) async {
    final body = await getJson('/api/operator/hourly/context', token: token);
    return OperatorHourlyContext.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<HourlyWorkLogView> startHourly({
    required String token,
    required int missionId,
    required int vehicleId,
    required int householdId,
    required HourlyGeo startGeo,
    String? photoUrl,
    String? note,
  }) async {
    final body = await postJson(
      '/api/hourly/start',
      token: token,
      body: {
        'mission_id': missionId,
        'vehicle_id': vehicleId,
        'household_id': householdId,
        'start_photo_url': photoUrl ?? 'https://example.com/operator-start.jpg',
        'start_geo': startGeo.toJson(),
        if (note != null && note.isNotEmpty) 'note': note,
      },
    );
    return HourlyWorkLogView.fromJson(body['data']['log'] as Map<String, dynamic>);
  }

  Future<HourlyWorkLogView> endHourly({
    required String token,
    required int logId,
    required HourlyGeo endGeo,
    String? photoUrl,
    String? note,
  }) async {
    final body = await postJson(
      '/api/hourly/$logId/end',
      token: token,
      body: {
        'end_photo_url': photoUrl ?? 'https://example.com/operator-end.jpg',
        'end_geo': endGeo.toJson(),
        if (note != null && note.isNotEmpty) 'note': note,
      },
    );
    return HourlyWorkLogView.fromJson(body['data']['log'] as Map<String, dynamic>);
  }

  Future<MembershipObjection> resolveObjection({
    required String token,
    required int objectionId,
    required String status,
    required String reason,
  }) async {
    final body = await postJson(
      '/api/coop/objections/$objectionId/resolve',
      token: token,
      body: {'status': status, 'reason': reason},
    );
    return MembershipObjection.fromJson(body['data']['objection'] as Map<String, dynamic>);
  }
}
