import 'dart:convert';

import 'package:hive_flutter/hive_flutter.dart';

import 'mission_step_queue_item.dart';

/// Persistent local queue for mission step updates (Hive).
class MissionStepQueueStore {
  MissionStepQueueStore({Box<String>? box}) : _box = box;

  static const boxName = 'mission_step_queue_v1';

  Box<String>? _box;

  Future<void> init() async {
    if (_box != null && _box!.isOpen) return;
    _box = await Hive.openBox<String>(boxName);
  }

  Box<String> get _requireBox {
    final b = _box;
    if (b == null || !b.isOpen) {
      throw StateError('MissionStepQueueStore.init() must be called first');
    }
    return b;
  }

  Future<void> enqueue(MissionStepQueueItem item) async {
    await _requireBox.put(item.id, jsonEncode(item.toJson()));
  }

  Future<void> remove(String id) async {
    await _requireBox.delete(id);
  }

  Future<void> removeAllForMission(int missionId) async {
    final toRemove = <String>[];
    for (final key in _requireBox.keys) {
      final raw = _requireBox.get(key);
      if (raw == null) continue;
      final item = MissionStepQueueItem.fromJson(
        jsonDecode(raw) as Map<String, dynamic>,
      );
      if (item.missionId == missionId) toRemove.add(key as String);
    }
    await _requireBox.deleteAll(toRemove);
  }

  List<MissionStepQueueItem> getAllOrdered() {
    final items = <MissionStepQueueItem>[];
    for (final raw in _requireBox.values) {
      items.add(
        MissionStepQueueItem.fromJson(
          jsonDecode(raw) as Map<String, dynamic>,
        ),
      );
    }
    items.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return items;
  }

  List<MissionStepQueueItem> pendingForMission(int missionId) {
    return getAllOrdered().where((e) => e.missionId == missionId).toList();
  }

  bool hasPending(int missionId) => pendingForMission(missionId).isNotEmpty;

  Set<int> pendingMissionIds() {
    return getAllOrdered().map((e) => e.missionId).toSet();
  }

  /// Last queued step for optimistic UI (may differ from server until sync).
  String? optimisticStatusForMission(int missionId) {
    final pending = pendingForMission(missionId);
    if (pending.isEmpty) return null;
    return pending.last.step;
  }

  Future<void> clear() async {
    await _requireBox.clear();
  }
}
