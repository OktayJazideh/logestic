import 'package:shared_preferences/shared_preferences.dart';

class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.role,
    this.mobileNumber,
  });

  final String accessToken;
  final String role;
  final String? mobileNumber;
}

class SessionStore {
  static const _kToken = 'auth.access_token';
  static const _kRole = 'auth.role';
  static const _kMobile = 'auth.mobile';
  static const _kMineId = 'context.mine_id';

  Future<void> saveSession(AuthSession session) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kToken, session.accessToken);
    await prefs.setString(_kRole, session.role);
    await prefs.remove(_kMineId);
    if (session.mobileNumber != null) {
      await prefs.setString(_kMobile, session.mobileNumber!);
    }
  }

  Future<AuthSession?> readSession() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(_kToken);
    final role = prefs.getString(_kRole);
    if (token == null || role == null) return null;
    return AuthSession(
      accessToken: token,
      role: role,
      mobileNumber: prefs.getString(_kMobile),
    );
  }

  Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kToken);
    await prefs.remove(_kRole);
    await prefs.remove(_kMobile);
    await prefs.remove(_kMineId);
  }

  Future<void> saveMineId(int mineId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_kMineId, mineId);
  }

  Future<int?> readMineId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getInt(_kMineId);
  }
}
