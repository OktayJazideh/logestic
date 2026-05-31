import 'geofence_math.dart';

const double inTransitAssumedSpeedKmh = 40;

/// Haversine road distance at [inTransitAssumedSpeedKmh] — label «تقریبی» in UI.
String formatApproxTransitEta({
  required double mineLat,
  required double mineLng,
  required double factoryLat,
  required double factoryLng,
}) {
  final meters = haversineDistanceMeters(mineLat, mineLng, factoryLat, factoryLng);
  final km = meters / 1000;
  final hours = km / inTransitAssumedSpeedKmh;
  if (hours < 1 / 60) {
    return 'کمتر از ۱ دقیقه (تقریبی)';
  }
  if (hours < 1) {
    final minutes = (hours * 60).round().clamp(1, 59);
    return 'حدود $minutes دقیقه (تقریبی)';
  }
  final h = hours.floor();
  final m = ((hours - h) * 60).round();
  if (m == 0) {
    return 'حدود $h ساعت (تقریبی)';
  }
  return 'حدود $h ساعت و $m دقیقه (تقریبی)';
}
