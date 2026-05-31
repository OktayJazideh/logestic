import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';

import 'package:mineral_api/mineral_api.dart';
import 'package:driver_app/core/offline/mission_step_queue_item.dart';
import 'package:driver_app/core/offline/mission_step_queue_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory tempDir;
  late MissionStepQueueStore store;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('offline_queue_test');
    Hive.init(tempDir.path);
    store = MissionStepQueueStore();
    await store.init();
    await store.clear();
  });

  tearDown(() async {
    await Hive.deleteFromDisk();
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  MissionStepQueueItem item({
    required String id,
    required int missionId,
    required String step,
    String previous = 'ASSIGNED',
  }) {
    return MissionStepQueueItem(
      id: id,
      missionId: missionId,
      step: step,
      previousStatus: previous,
      createdAt: DateTime.utc(2026, 5, 17, 10, 0, 0),
    );
  }

  test('enqueue preserves FIFO order by createdAt', () async {
    final a = item(
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      missionId: 1,
      step: 'ACCEPTED',
    ).toJson();
    final b = item(
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      missionId: 1,
      step: 'ARRIVED',
      previous: 'ACCEPTED',
    );
    final itemA = MissionStepQueueItem.fromJson(a);
    final itemB = MissionStepQueueItem.fromJson({
      ...b,
      'created_at': DateTime.utc(2026, 5, 17, 10, 1, 0).toIso8601String(),
    });

    await store.enqueue(itemA);
    await store.enqueue(itemB);

    final ordered = store.getAllOrdered();
    expect(ordered.length, 2);
    expect(ordered.first.step, 'ACCEPTED');
    expect(ordered.last.step, 'ARRIVED');
    expect(store.optimisticStatusForMission(1), 'ARRIVED');
  });

  test('removeAllForMission clears mission pending set', () async {
    await store.enqueue(
      item(
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        missionId: 7,
        step: 'ACCEPTED',
      ),
    );
    await store.enqueue(
      item(
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        missionId: 9,
        step: 'ACCEPTED',
      ),
    );

    await store.removeAllForMission(7);

    expect(store.hasPending(7), isFalse);
    expect(store.hasPending(9), isTrue);
    expect(store.pendingMissionIds(), {9});
  });

  test('idempotency keys are valid UUID v4', () {
    final key = MineralApiClient.newIdempotencyKey();
    expect(
      RegExp(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      ).hasMatch(key),
      isTrue,
    );
  });
}
