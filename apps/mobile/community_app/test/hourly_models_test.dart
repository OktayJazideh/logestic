import 'package:community_app/models/hourly_models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('OperatorHourlyContext parses active log and assignments', () {
    final ctx = OperatorHourlyContext.fromJson({
      'active_log': {
        'id': 9,
        'status': 'STARTED',
        'started_at': '2026-05-31T10:00:00.000Z',
        'equipment_label': 'IR-01',
      },
      'assignments': [],
    });
    expect(ctx.activeLog?.id, 9);
    expect(ctx.activeLog?.status, 'STARTED');
    expect(ctx.assignments, isEmpty);
  });

  test('OperatorHourlyAssignment fromJson', () {
    final a = OperatorHourlyAssignment.fromJson({
      'mission_id': 1,
      'vehicle_id': 2,
      'household_id': 3,
      'equipment_label': 'ABC',
      'need_id': 44,
      'need_label': 'بیل',
    });
    expect(a.missionId, 1);
    expect(a.needId, 44);
    expect(a.needLabel, 'بیل');
  });

  test('HourlyGeo toJson', () {
    const g = HourlyGeo(lat: 27.1, lng: 55.2);
    expect(g.toJson(), {'lat': 27.1, 'lng': 55.2});
  });
}
