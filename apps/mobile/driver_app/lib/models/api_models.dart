class OtpRequestResponse {
  OtpRequestResponse({required this.expiresInSeconds, this.requestId});

  final int expiresInSeconds;
  final String? requestId;
}

class AuthVerifyResponse {
  AuthVerifyResponse({required this.accessToken, required this.role, this.requestId});

  final String accessToken;
  final String role;
  final String? requestId;
}

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
  });

  final int id;
  final int loadId;
  final int mineId;
  final int ownerId;
  final int driverId;
  final int vehicleId;
  final String status;

  factory DriverMission.fromJson(Map<String, dynamic> json) {
    return DriverMission(
      id: json['id'] as int,
      loadId: json['load_id'] as int,
      mineId: json['mine_id'] as int,
      ownerId: json['owner_id'] as int,
      driverId: json['driver_id'] as int,
      vehicleId: json['vehicle_id'] as int,
      status: json['status'] as String,
    );
  }
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

