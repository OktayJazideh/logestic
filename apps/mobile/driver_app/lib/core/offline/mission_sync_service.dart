import 'package:mineral_api/mineral_api.dart';

import '../driver_api_client.dart';
import '../connectivity_service.dart';
import 'mission_step_queue_item.dart';
import 'mission_step_queue_store.dart';

enum SyncOutcome { completed, nothingPending, skippedOffline, conflict, failed }

class SyncResult {
  const SyncResult(this.outcome, {this.conflictMissionId, this.message});

  final SyncOutcome outcome;
  final int? conflictMissionId;
  final String? message;
}

/// Replays queued mission steps when connectivity returns (OFFLINE-1).
class MissionSyncService {
  MissionSyncService({
    required DriverApiClient api,
    required MissionStepQueueStore store,
    required ConnectivityService connectivity,
  })  : _api = api,
        _store = store,
        _connectivity = connectivity;

  final DriverApiClient _api;
  final MissionStepQueueStore _store;
  final ConnectivityService _connectivity;

  bool _syncing = false;

  Future<SyncResult> syncPending({required String token}) async {
    if (_syncing) {
      return const SyncResult(SyncOutcome.nothingPending);
    }
    if (!await _connectivity.isOnline) {
      return const SyncResult(SyncOutcome.skippedOffline);
    }

    final pending = _store.getAllOrdered();
    if (pending.isEmpty) {
      return const SyncResult(SyncOutcome.nothingPending);
    }

    _syncing = true;
    try {
      for (final item in pending) {
        final result = await _syncOne(token: token, item: item);
        if (result != null) return result;
      }
      return const SyncResult(SyncOutcome.completed);
    } catch (e) {
      final msg = e is ApiException ? e.message : e.toString();
      return SyncResult(SyncOutcome.failed, message: msg);
    } finally {
      _syncing = false;
    }
  }

  /// Returns non-null [SyncResult] when sync must stop (conflict / auth).
  Future<SyncResult?> _syncOne({
    required String token,
    required MissionStepQueueItem item,
  }) async {
    try {
      await _api.advanceMission(
        token: token,
        missionId: item.missionId,
        step: item.step,
        idempotencyKey: item.id,
        latitude: item.latitude,
        longitude: item.longitude,
        accuracyM: item.accuracyM,
        distanceM: item.distanceM,
        receiptPhotoUrl: item.receiptPhotoUrl,
        receiptPhotoBase64: item.receiptPhotoBase64,
      );
      await _store.remove(item.id);
      return null;
    } on ApiException catch (e) {
      if (e.isUnauthorized) rethrow;
      if (e.isInvalidTransition) {
        await _store.removeAllForMission(item.missionId);
        return SyncResult(
          SyncOutcome.conflict,
          conflictMissionId: item.missionId,
          message:
              'وضعیت ماموریت در سرور تغییر کرده است. وضعیت محلی بازنشانی شد.',
        );
      }
      if (e.isNetworkError) rethrow;
      // Other API errors: drop poison item so queue does not block forever.
      await _store.remove(item.id);
      return SyncResult(SyncOutcome.failed, message: e.message);
    }
  }
}
