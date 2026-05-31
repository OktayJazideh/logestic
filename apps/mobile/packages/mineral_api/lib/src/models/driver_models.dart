/// Driver KYC profile returned by `GET /api/driver/me`.
class DriverMe {
  DriverMe({
    required this.userId,
    required this.mobileNumber,
    required this.kycStatus,
    this.driverId,
    this.fullName,
    this.cooperativeId,
  });

  final int userId;
  final String mobileNumber;
  final String kycStatus;
  final int? driverId;
  final String? fullName;
  final int? cooperativeId;

  bool get isApproved => kycStatus == 'APPROVED';
  bool get isPending =>
      kycStatus == 'PENDING' || kycStatus == 'NEEDS_CORRECTION';
  bool get isSuspended => kycStatus == 'SUSPENDED' || kycStatus == 'REJECTED';

  factory DriverMe.fromJson(Map<String, dynamic> json) {
    return DriverMe(
      userId: (json['user_id'] as num).toInt(),
      mobileNumber: json['mobile_number'] as String,
      kycStatus: json['kyc_status'] as String? ?? 'PENDING',
      driverId: (json['driver_id'] as num?)?.toInt(),
      fullName: json['full_name'] as String?,
      cooperativeId: (json['cooperative_id'] as num?)?.toInt(),
    );
  }
}
