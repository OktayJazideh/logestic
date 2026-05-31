import 'dart:math' as math;

/// Haversine distance in meters (matches backend `geofence.ts`).
double haversineDistanceMeters(double lat1, double lng1, double lat2, double lng2) {
  const r = 6371000.0;
  double toRad(double d) => d * math.pi / 180;
  final dLat = toRad(lat2 - lat1);
  final dLng = toRad(lng2 - lng1);
  final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(toRad(lat1)) * math.cos(toRad(lat2)) * math.sin(dLng / 2) * math.sin(dLng / 2);
  return 2 * r * math.asin(math.min(1, math.sqrt(a)));
}

bool isWithinGeofence({
  required double lat,
  required double lng,
  required double centerLat,
  required double centerLng,
  required double radiusM,
}) {
  return haversineDistanceMeters(lat, lng, centerLat, centerLng) <= radiusM;
}
