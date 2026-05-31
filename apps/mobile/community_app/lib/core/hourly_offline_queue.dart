import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// HOURLY-APP-1 stub: queue start/end when offline; flush on reconnect.
class HourlyOfflineQueue {
  HourlyOfflineQueue(this._prefs);

  static const _key = 'hourly_offline_queue_v1';

  final SharedPreferences _prefs;

  static Future<HourlyOfflineQueue> open() async {
    final prefs = await SharedPreferences.getInstance();
    return HourlyOfflineQueue(prefs);
  }

  List<Map<String, dynamic>> peekAll() {
    final raw = _prefs.getStringList(_key) ?? [];
    return raw
        .map((s) => jsonDecode(s) as Map<String, dynamic>)
        .toList();
  }

  Future<void> enqueue(Map<String, dynamic> item) async {
    final list = _prefs.getStringList(_key) ?? [];
    list.add(jsonEncode(item));
    await _prefs.setStringList(_key, list);
  }

  Future<void> clear() async => _prefs.remove(_key);

  Future<int> flush(Future<void> Function(Map<String, dynamic> item) send) async {
    final pending = peekAll();
    if (pending.isEmpty) return 0;
    var sent = 0;
    for (final item in pending) {
      await send(item);
      sent++;
    }
    await clear();
    return sent;
  }
}
