/// A driver mission step transition queued while offline (OFFLINE-1).
class MissionStepQueueItem {
  MissionStepQueueItem({
    required this.id,
    required this.missionId,
    required this.step,
    required this.previousStatus,
    required this.createdAt,
    this.latitude,
    this.longitude,
    this.accuracyM,
    this.distanceM,
    this.receiptPhotoUrl,
    this.receiptPhotoBase64,
  });

  /// UUID v4 — reused as Idempotency-Key on sync.
  final String id;
  final int missionId;
  final String step;
  final String previousStatus;
  final DateTime createdAt;
  final double? latitude;
  final double? longitude;
  final double? accuracyM;
  final double? distanceM;
  final String? receiptPhotoUrl;
  final String? receiptPhotoBase64;

  Map<String, dynamic> toJson() => {
        'id': id,
        'mission_id': missionId,
        'step': step,
        'previous_status': previousStatus,
        'created_at': createdAt.toIso8601String(),
        if (latitude != null) 'latitude': latitude,
        if (longitude != null) 'longitude': longitude,
        if (accuracyM != null) 'accuracy_m': accuracyM,
        if (distanceM != null) 'distance_m': distanceM,
        if (receiptPhotoUrl != null) 'receipt_photo_url': receiptPhotoUrl,
        if (receiptPhotoBase64 != null) 'receipt_photo_base64': receiptPhotoBase64,
      };

  factory MissionStepQueueItem.fromJson(Map<String, dynamic> json) {
    double? d(dynamic v) => v == null ? null : (v as num).toDouble();
    return MissionStepQueueItem(
      id: json['id'] as String,
      missionId: json['mission_id'] as int,
      step: json['step'] as String,
      previousStatus: json['previous_status'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
      latitude: d(json['latitude']),
      longitude: d(json['longitude']),
      accuracyM: d(json['accuracy_m']),
      distanceM: d(json['distance_m']),
      receiptPhotoUrl: json['receipt_photo_url'] as String?,
      receiptPhotoBase64: json['receipt_photo_base64'] as String?,
    );
  }
}
