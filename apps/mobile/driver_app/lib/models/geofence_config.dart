class GeofenceConfig {
  const GeofenceConfig({
    required this.target,
    required this.lat,
    required this.lng,
    required this.radiusM,
    required this.label,
  });

  final String target;
  final double lat;
  final double lng;
  final double radiusM;
  final String label;

  factory GeofenceConfig.fromJson(Map<String, dynamic> json) {
    final g = json['geofence'] as Map<String, dynamic>? ?? json;
    return GeofenceConfig(
      target: g['target'] as String,
      lat: (g['lat'] as num).toDouble(),
      lng: (g['lng'] as num).toDouble(),
      radiusM: (g['radius_m'] as num).toDouble(),
      label: g['label'] as String? ?? '',
    );
  }
}
