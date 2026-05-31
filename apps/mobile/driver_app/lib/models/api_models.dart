class Mine {
  Mine({required this.id, required this.mineCode, required this.name, this.locationCoordinates});

  final int id;
  final String mineCode;
  final String name;
  final String? locationCoordinates;

  factory Mine.fromJson(Map<String, dynamic> json) {
    return Mine(
      id: json['id'] as int,
      mineCode: json['mine_code'] as String,
      name: json['name'] as String,
      locationCoordinates: json['location_coordinates'] as String?,
    );
  }
}

class DriverMission {
  DriverMission({
    required this.id,
    required this.loadId,
    required this.mineId,
    required this.ownerId,
    required this.driverId,
    required this.vehicleId,
    required this.status,
    this.licensePlate,
    this.destination,
    this.approximateWeightKg,
    this.origin,
    this.materialType,
    this.employerContact,
    this.mineLat,
    this.mineLng,
    this.factoryLat,
    this.factoryLng,
  });

  final int id;
  final int loadId;
  final int mineId;
  final int ownerId;
  final int driverId;
  final int vehicleId;
  final String status;
  final String? licensePlate;
  final String? destination;
  final double? approximateWeightKg;
  final String? origin;
  final String? materialType;
  final String? employerContact;
  final double? mineLat;
  final double? mineLng;
  final double? factoryLat;
  final double? factoryLng;

  factory DriverMission.fromJson(Map<String, dynamic> json) {
    double? weight(dynamic v) => v == null ? null : (v as num).toDouble();
    double? coord(dynamic v) => v == null ? null : (v as num).toDouble();

    return DriverMission(
      id: json['id'] as int,
      loadId: json['load_id'] as int,
      mineId: json['mine_id'] as int,
      ownerId: json['owner_id'] as int,
      driverId: json['driver_id'] as int,
      vehicleId: json['vehicle_id'] as int,
      status: json['status'] as String,
      licensePlate: json['license_plate'] as String?,
      destination: json['destination'] as String?,
      approximateWeightKg: weight(json['approximate_weight_kg']),
      origin: json['origin'] as String?,
      materialType: json['material_type'] as String?,
      employerContact: json['employer_contact'] as String?,
      mineLat: coord(json['mine_lat']),
      mineLng: coord(json['mine_lng']),
      factoryLat: coord(json['factory_lat']),
      factoryLng: coord(json['factory_lng']),
    );
  }

  DriverMission copyWith({String? status}) {
    return DriverMission(
      id: id,
      loadId: loadId,
      mineId: mineId,
      ownerId: ownerId,
      driverId: driverId,
      vehicleId: vehicleId,
      status: status ?? this.status,
      licensePlate: licensePlate,
      destination: destination,
      approximateWeightKg: approximateWeightKg,
      origin: origin,
      materialType: materialType,
      employerContact: employerContact,
      mineLat: mineLat,
      mineLng: mineLng,
      factoryLat: factoryLat,
      factoryLng: factoryLng,
    );
  }
}

class DriverDashboardSummary {
  const DriverDashboardSummary({
    required this.todayTrips,
    required this.pendingSettlement,
    this.todayDeliveries = 0,
    this.todayKm = 0,
  });

  final int todayTrips;
  final int todayDeliveries;
  final int todayKm;
  final int pendingSettlement;

  factory DriverDashboardSummary.fromJson(Map<String, dynamic> json) {
    return DriverDashboardSummary(
      todayTrips: (json['today_trips'] as num).toInt(),
      todayDeliveries: (json['today_deliveries'] as num?)?.toInt() ?? 0,
      todayKm: (json['today_km'] as num?)?.toInt() ?? 0,
      pendingSettlement: (json['pending_settlement'] as num).toInt(),
    );
  }
}

class DriverDashboardDriver {
  const DriverDashboardDriver({required this.fullName, required this.driverCode});

  final String fullName;
  final String driverCode;

  factory DriverDashboardDriver.fromJson(Map<String, dynamic> json) {
    return DriverDashboardDriver(
      fullName: json['full_name'] as String,
      driverCode: json['driver_code'] as String,
    );
  }
}

class DriverDashboardMission {
  DriverDashboardMission({
    required this.id,
    required this.status,
    required this.origin,
    required this.destination,
    required this.materialType,
    this.completedAt,
  });

  final int id;
  final String status;
  final String origin;
  final String destination;
  final String materialType;
  final String? completedAt;

  factory DriverDashboardMission.fromJson(Map<String, dynamic> json) {
    return DriverDashboardMission(
      id: (json['id'] as num).toInt(),
      status: json['status'] as String,
      origin: json['origin'] as String,
      destination: json['destination'] as String,
      materialType: json['material_type'] as String,
      completedAt: json['completed_at'] as String?,
    );
  }
}

class DriverDashboard {
  DriverDashboard({
    required this.state,
    required this.summary,
    required this.driver,
    this.activeMission,
    this.recentHistory = const [],
  });

  final String state;
  final DriverDashboardSummary summary;
  final DriverDashboardDriver driver;
  final DriverDashboardMission? activeMission;
  final List<DriverDashboardMission> recentHistory;

  bool get isIdle => state == 'IDLE';
  bool get isActive => state == 'ACTIVE';
  bool get isAwaitingWb => state == 'AWAITING_WB';

  factory DriverDashboard.fromJson(Map<String, dynamic> json) {
    final active = json['active_mission'];
    final history = json['recent_history'] as List<dynamic>? ?? [];
    final driverJson = json['driver'] as Map<String, dynamic>?;
    return DriverDashboard(
      state: json['state'] as String,
      summary: DriverDashboardSummary.fromJson(json['summary'] as Map<String, dynamic>),
      driver: driverJson != null
          ? DriverDashboardDriver.fromJson(driverJson)
          : const DriverDashboardDriver(fullName: 'راننده', driverCode: 'DRV-0'),
      activeMission:
          active != null ? DriverDashboardMission.fromJson(active as Map<String, dynamic>) : null,
      recentHistory: history
          .map((e) => DriverDashboardMission.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// WF-WB-READ-1: read-only weighbridge status for driver.
class DriverWeighbridgeStatus {
  DriverWeighbridgeStatus({
    required this.ticketStatus,
    this.emptyWeightKg,
    this.loadedWeightKg,
    this.netWeightKg,
    this.entrySource,
    required this.holdPercent,
    required this.paymentHold,
    this.holdReason,
  });

  final String ticketStatus;
  final int? emptyWeightKg;
  final int? loadedWeightKg;
  final int? netWeightKg;
  final String? entrySource;
  final int holdPercent;
  final bool paymentHold;
  final String? holdReason;

  factory DriverWeighbridgeStatus.fromJson(Map<String, dynamic> json) {
    int? kg(dynamic v) => v == null ? null : (v as num).round();

    return DriverWeighbridgeStatus(
      ticketStatus: json['ticket_status'] as String,
      emptyWeightKg: kg(json['empty_weight_kg']),
      loadedWeightKg: kg(json['loaded_weight_kg']),
      netWeightKg: kg(json['net_weight_kg']),
      entrySource: json['entry_source'] as String?,
      holdPercent: (json['hold_percent'] as num).toInt(),
      paymentHold: json['payment_hold'] as bool,
      holdReason: json['hold_reason'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'ticket_status': ticketStatus,
        'empty_weight_kg': emptyWeightKg,
        'loaded_weight_kg': loadedWeightKg,
        'net_weight_kg': netWeightKg,
        'entry_source': entrySource,
        'hold_percent': holdPercent,
        'payment_hold': paymentHold,
        'hold_reason': holdReason,
      };
}

class WeighbridgeTicket {
  WeighbridgeTicket({
    required this.id,
    required this.missionId,
    required this.loadId,
    required this.ticketNumber,
    required this.status,
    this.emptyWeight,
    this.loadedWeight,
    this.netWeight,
  });

  final int id;
  final int missionId;
  final int loadId;
  final String ticketNumber;
  final String status;
  final double? emptyWeight;
  final double? loadedWeight;
  final double? netWeight;

  factory WeighbridgeTicket.fromJson(Map<String, dynamic> json) {
    double? n(dynamic v) => v == null ? null : (v as num).toDouble();

    return WeighbridgeTicket(
      id: json['id'] as int,
      missionId: json['mission_id'] as int,
      loadId: json['load_id'] as int,
      ticketNumber: json['ticket_number'] as String,
      status: json['status'] as String,
      emptyWeight: n(json['empty_weight']),
      loadedWeight: n(json['loaded_weight']),
      netWeight: n(json['net_weight']),
    );
  }
}

