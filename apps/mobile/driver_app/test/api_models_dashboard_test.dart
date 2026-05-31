import 'package:flutter_test/flutter_test.dart';

import 'package:driver_app/models/api_models.dart';

/// Contract test: JSON shape from GET /api/driver/dashboard (snake_case).
void main() {
  test('DriverDashboard.fromJson parses backend dashboard payload', () {
    const payload = {
      'state': 'ACTIVE',
      'driver': {
        'full_name': 'راننده تفتان',
        'driver_code': 'DRV-12',
      },
      'summary': {
        'today_trips': 2,
        'today_deliveries': 1,
        'today_km': 0,
        'pending_settlement': 0,
      },
      'active_mission': {
        'id': 42,
        'status': 'IN_TRANSIT',
        'origin': 'معدن تفتان',
        'destination': 'روستای شمال',
        'material_type': 'ORE',
      },
      'recent_history': [],
    };

    final dash = DriverDashboard.fromJson(payload);

    expect(dash.state, 'ACTIVE');
    expect(dash.driver.fullName, 'راننده تفتان');
    expect(dash.driver.driverCode, 'DRV-12');
    expect(dash.summary.todayTrips, 2);
    expect(dash.summary.todayDeliveries, 1);
    expect(dash.summary.todayKm, 0);
    expect(dash.summary.pendingSettlement, 0);
    expect(dash.activeMission?.id, 42);
    expect(dash.isActive, isTrue);
  });

  test('DriverMission.fromJson parses backend mission detail payload', () {
    const payload = {
      'id': 42,
      'load_id': 11485,
      'mine_id': 1,
      'owner_id': 3,
      'driver_id': 4,
      'vehicle_id': 5,
      'status': 'IN_TRANSIT',
      'license_plate': '12ب345-67',
      'destination': 'کارخانه شمال',
      'origin': 'معدن تفتان',
      'approximate_weight_kg': 23.8,
      'material_type': 'ORE',
      'employer_contact': '09000000007',
      'mine_lat': 27.0,
      'mine_lng': 55.0,
      'factory_lat': 27.05,
      'factory_lng': 55.05,
    };

    final m = DriverMission.fromJson(payload);

    expect(m.id, 42);
    expect(m.loadId, 11485);
    expect(m.origin, 'معدن تفتان');
    expect(m.mineLat, 27.0);
    expect(m.factoryLng, 55.05);
  });
}
