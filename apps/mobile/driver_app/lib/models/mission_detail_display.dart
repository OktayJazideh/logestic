import 'api_models.dart';

/// Display fields for mission detail card (from dashboard or API enrichment).
class MissionDetailDisplay {
  const MissionDetailDisplay({
    this.licensePlate,
    this.destination,
    this.approximateWeightKg,
    this.origin,
    this.materialType,
    this.employerContact,
  });

  final String? licensePlate;
  final String? destination;
  final double? approximateWeightKg;
  final String? origin;
  final String? materialType;
  final String? employerContact;

  factory MissionDetailDisplay.fromDashboard(DriverDashboardMission mission) {
    return MissionDetailDisplay(
      destination: mission.destination,
      origin: mission.origin,
      materialType: mission.materialType,
    );
  }

  factory MissionDetailDisplay.fromMission(DriverMission mission) {
    return MissionDetailDisplay(
      licensePlate: mission.licensePlate,
      destination: mission.destination,
      approximateWeightKg: mission.approximateWeightKg,
      origin: mission.origin,
      materialType: mission.materialType,
      employerContact: mission.employerContact,
    );
  }
}
