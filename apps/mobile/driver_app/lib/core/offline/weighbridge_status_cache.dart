import 'dart:convert';

import 'package:hive_flutter/hive_flutter.dart';

import '../../models/api_models.dart';

/// Offline cache for last successful weighbridge-status GET (WF-WB-READ-1).
class WeighbridgeStatusCache {
  WeighbridgeStatusCache({Box<String>? box}) : _box = box;

  static const boxName = 'weighbridge_status_cache_v1';

  Box<String>? _box;

  Future<void> init() async {
    if (_box != null && _box!.isOpen) return;
    _box = await Hive.openBox<String>(boxName);
  }

  Box<String> get _requireBox {
    final b = _box;
    if (b == null || !b.isOpen) {
      throw StateError('WeighbridgeStatusCache.init() must be called first');
    }
    return b;
  }

  String _key(int missionId) => 'mission_$missionId';

  Future<void> put(int missionId, DriverWeighbridgeStatus status) async {
    if (!isReady) return;
    await _requireBox.put(_key(missionId), jsonEncode(status.toJson()));
  }

  bool get isReady => _box != null && _box!.isOpen;

  DriverWeighbridgeStatus? get(int missionId) {
    if (!isReady) return null;
    final raw = _requireBox.get(_key(missionId));
    if (raw == null) return null;
    return DriverWeighbridgeStatus.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }
}
