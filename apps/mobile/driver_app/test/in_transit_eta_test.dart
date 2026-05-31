import 'package:flutter_test/flutter_test.dart';

import 'package:driver_app/core/geofence_math.dart';
import 'package:driver_app/core/in_transit_eta.dart';

void main() {
  test('formatApproxTransitEta uses 40 km/h over haversine', () {
    const mineLat = 27.0;
    const mineLng = 55.0;
    const factoryLat = 27.45;
    const factoryLng = 55.0;
    final km = haversineDistanceMeters(mineLat, mineLng, factoryLat, factoryLng) / 1000;
    final label = formatApproxTransitEta(
      mineLat: mineLat,
      mineLng: mineLng,
      factoryLat: factoryLat,
      factoryLng: factoryLng,
    );
    expect(label, contains('تقریبی'));
    final hours = km / inTransitAssumedSpeedKmh;
    if (hours < 1) {
      expect(label, contains('دقیقه'));
    } else {
      expect(label, contains('ساعت'));
    }
  });
}
