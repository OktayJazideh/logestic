class ApiException implements Exception {
  const ApiException(
    this.message, {
    this.statusCode,
    this.errorCode,
    this.isNetworkError = false,
  });

  final String message;
  final int? statusCode;
  final String? errorCode;
  final bool isNetworkError;

  bool get isUnauthorized => statusCode == 401;

  bool get isMineNotSelected =>
      statusCode == 400 && errorCode == 'mine_not_selected';

  bool get isInvalidTransition =>
      statusCode == 409 && errorCode == 'invalid_transition';

  @override
  String toString() => message;
}
