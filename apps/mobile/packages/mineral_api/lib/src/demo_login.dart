import 'mineral_api_client.dart';
import 'models/auth_models.dart';
import 'demo_users.dart';
import 'session_store.dart';

class DemoLoginResult {
  const DemoLoginResult({
    required this.accessToken,
    required this.role,
    required this.mobileNumber,
    required this.workspaceSelected,
  });

  final String accessToken;
  final String role;
  final String mobileNumber;
  final bool workspaceSelected;
}

/// One-click demo login — no SMS. Auto-selects workspace when persona defines it.
Future<DemoLoginResult> performDemoLogin({
  required MineralApiClient api,
  required DemoPersona persona,
  required SessionStore sessionStore,
}) async {
  final login = await api.devLogin(persona.mobile);
  var workspaceSelected = false;

  final ws = persona.workspace;
  if (ws != null) {
    await api.selectWorkspace(
      token: login.accessToken,
      mineId: ws.mineId,
      cooperativeId: ws.cooperativeId,
      membershipKind: ws.membershipKind,
    );
    await sessionStore.saveMineId(ws.mineId);
    workspaceSelected = true;
  }

  await sessionStore.saveSession(
    AuthSession(
      accessToken: login.accessToken,
      role: login.role,
      mobileNumber: persona.mobile,
    ),
  );

  return DemoLoginResult(
    accessToken: login.accessToken,
    role: login.role,
    mobileNumber: persona.mobile,
    workspaceSelected: workspaceSelected,
  );
}
