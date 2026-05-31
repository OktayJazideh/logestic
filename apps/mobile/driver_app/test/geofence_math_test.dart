import 'package:flutter_test/flutter_test.dart';

import 'package:driver_app/core/geofence_math.dart';

void main() {
  test('haversine zero at same point', () {
    expect(haversineDistanceMeters(27, 55, 27, 55), 0);
  });

  test('isWithinGeofence uses radius', () {
    expect(
      isWithinGeofence(
        lat: 27,
        lng: 55,
        centerLat: 27,
        centerLng: 55,
        radiusM: 500,
      ),
      isTrue,
    );
    expect(
      isWithinGeofence(
        lat: 28,
        lng: 56,
        centerLat: 27,
        centerLng: 55,
        radiusM: 500,
      ),
      isFalse,
    );
  });
}
