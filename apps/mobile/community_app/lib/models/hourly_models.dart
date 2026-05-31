class HourlyGeo {
  const HourlyGeo({required this.lat, required this.lng});

  final double lat;
  final double lng;

  Map<String, dynamic> toJson() => {'lat': lat, 'lng': lng};
}

class OperatorHourlyAssignment {
  OperatorHourlyAssignment({
    required this.missionId,
    required this.vehicleId,
    required this.householdId,
    required this.equipmentLabel,
    this.needId,
    this.needLabel,
  });

  final int missionId;
  final int vehicleId;
  final int householdId;
  final String equipmentLabel;
  final int? needId;
  final String? needLabel;

  factory OperatorHourlyAssignment.fromJson(Map<String, dynamic> json) {
    return OperatorHourlyAssignment(
      missionId: (json['mission_id'] as num).toInt(),
      vehicleId: (json['vehicle_id'] as num).toInt(),
      householdId: (json['household_id'] as num).toInt(),
      equipmentLabel: json['equipment_label']?.toString() ?? '—',
      needId: json['need_id'] != null ? (json['need_id'] as num).toInt() : null,
      needLabel: json['need_label']?.toString(),
    );
  }
}

class HourlyWorkLogView {
  HourlyWorkLogView({
    required this.id,
    required this.status,
    this.startedAt,
    this.endedAt,
    this.rawHours,
    this.equipmentLabel,
    this.missionId,
  });

  final int id;
  final String status;
  final DateTime? startedAt;
  final DateTime? endedAt;
  final double? rawHours;
  final String? equipmentLabel;
  final int? missionId;

  factory HourlyWorkLogView.fromJson(Map<String, dynamic> json) {
    DateTime? parseDt(dynamic v) {
      if (v == null) return null;
      return DateTime.tryParse(v.toString());
    }

    return HourlyWorkLogView(
      id: (json['id'] as num).toInt(),
      status: json['status']?.toString() ?? '',
      startedAt: parseDt(json['started_at']),
      endedAt: parseDt(json['ended_at']),
      rawHours: json['raw_hours'] != null ? (json['raw_hours'] as num).toDouble() : null,
      equipmentLabel: json['equipment_label']?.toString(),
      missionId: json['mission_id'] != null ? (json['mission_id'] as num).toInt() : null,
    );
  }
}

class OperatorHourlyContext {
  OperatorHourlyContext({this.activeLog, required this.assignments});

  final HourlyWorkLogView? activeLog;
  final List<OperatorHourlyAssignment> assignments;

  factory OperatorHourlyContext.fromJson(Map<String, dynamic> json) {
    final active = json['active_log'];
    final list = json['assignments'] as List<dynamic>? ?? [];
    return OperatorHourlyContext(
      activeLog: active != null ? HourlyWorkLogView.fromJson(active as Map<String, dynamic>) : null,
      assignments: list
          .map((e) => OperatorHourlyAssignment.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
