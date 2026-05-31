import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';

import 'package:mineral_api/mineral_api.dart';

import 'package:driver_app/core/driver_api_client.dart';
import 'package:driver_app/core/connectivity_service.dart';
import 'package:driver_app/core/offline/mission_step_queue_item.dart';
import 'package:driver_app/core/offline/mission_step_queue_store.dart';
import 'package:driver_app/core/offline/mission_sync_service.dart';
import 'package:driver_app/models/api_models.dart';

class _StubApi extends DriverApiClient {
  _StubApi(this._handler) : super(baseUrl: 'http://127.0.0.1:9');

  final Future<DriverMission> Function({
    required int missionId,
    required String step,
    String? idempotencyKey,
  }) _handler;

  int callCount = 0;
  String? lastIdempotencyKey;

  @override
  Future<DriverMission> updateMissionStep({
    required String token,
    required int missionId,
    required String step,
    String? idempotencyKey,
  }) async {
    callCount++;
    lastIdempotencyKey = idempotencyKey;
    return _handler(missionId: missionId, step: step, idempotencyKey: idempotencyKey);
  }
}

DriverMission _mission(int id, String status) {
  return DriverMission(
    id: id,
    loadId: 1,
    mineId: 1,
    ownerId: 1,
    driverId: 1,
    vehicleId: 1,
    status: status,
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory tempDir;
  late MissionStepQueueStore store;
  late bool online;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('offline_sync_test');
    Hive.init(tempDir.path);
    store = MissionStepQueueStore();
    await store.init();
    await store.clear();
    online = true;
  });

  tearDown(() async {
    await Hive.deleteFromDisk();
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  MissionStepQueueItem queued({
    required String id,
    required int missionId,
    required String step,
  }) {
    return MissionStepQueueItem(
      id: id,
      missionId: missionId,
      step: step,
      previousStatus: 'ASSIGNED',
      createdAt: DateTime.now().toUtc(),
    );
  }

  test('sync replays queue with stable idempotency key', () async {
    const idemKey = '11111111-1111-4111-8111-111111111111';
    await store.enqueue(
      queued(id: idemKey, missionId: 5, step: 'ACCEPTED'),
    );

    final api = _StubApi(({
      required missionId,
      required step,
      idempotencyKey,
    }) async {
      expect(idempotencyKey, idemKey);
      return _mission(missionId, step);
    });

    final sync = MissionSyncService(
      api: api,
      store: store,
      connectivity: ConnectivityService(onlineProbe: () async => online),
    );

    final result = await sync.syncPending(token: 't');
    expect(result.outcome, SyncOutcome.completed);
    expect(api.callCount, 1);
    expect(store.getAllOrdered(), isEmpty);
  });

  test('409 invalid_transition clears mission queue and reports conflict', () async {
    await store.enqueue(
      queued(
        id: '22222222-2222-4222-8222-222222222222',
        missionId: 3,
        step: 'ARRIVED',
      ),
    );

    final api = _StubApi(({
      required missionId,
      required step,
      idempotencyKey,
    }) async {
      throw const ApiException(
        'Invalid mission step transition',
        statusCode: 409,
        errorCode: 'invalid_transition',
      );
    });

    final sync = MissionSyncService(
      api: api,
      store: store,
      connectivity: ConnectivityService(onlineProbe: () async => true),
    );

    final result = await sync.syncPending(token: 't');
    expect(result.outcome, SyncOutcome.conflict);
    expect(result.conflictMissionId, 3);
    expect(store.hasPending(3), isFalse);
  });

  test('skips sync when offline probe is false', () async {
    await store.enqueue(
      queued(
        id: '33333333-3333-4333-8333-333333333333',
        missionId: 1,
        step: 'ACCEPTED',
      ),
    );

    online = false;
    final api = _StubApi(({
      required missionId,
      required step,
      idempotencyKey,
    }) async => _mission(missionId, step));

    final sync = MissionSyncService(
      api: api,
      store: store,
      connectivity: ConnectivityService(onlineProbe: () async => online),
    );

    final result = await sync.syncPending(token: 't');
    expect(result.outcome, SyncOutcome.skippedOffline);
    expect(api.callCount, 0);
    expect(store.getAllOrdered().length, 1);
  });
}
