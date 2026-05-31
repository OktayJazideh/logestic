class OtpRequestResponse {
  OtpRequestResponse({required this.expiresInSeconds, this.requestId});

  final int expiresInSeconds;
  final String? requestId;
}

class AuthVerifyResponse {
  AuthVerifyResponse({required this.accessToken, required this.role, this.requestId});

  final String accessToken;
  final String role;
  final String? requestId;
}

class AuthMe {
  AuthMe({
    required this.id,
    required this.mobileNumber,
    required this.role,
    required this.isActive,
  });

  final int id;
  final String mobileNumber;
  final String role;
  final bool isActive;

  factory AuthMe.fromJson(Map<String, dynamic> json) {
    return AuthMe(
      id: json['id'] as int,
      mobileNumber: json['mobile_number'] as String,
      role: json['role'] as String,
      isActive: json['is_active'] as bool? ?? true,
    );
  }
}
