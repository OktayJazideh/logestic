import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

import '../core/community_api_client.dart';
import 'screens/home_shell.dart';
import 'screens/hourly/hourly_end_screen.dart';
import 'screens/hourly/hourly_start_screen.dart';
import 'screens/household/register_screen.dart';
import 'screens/login_screen.dart';
import 'screens/splash_screen.dart';
import 'screens/workspace_select_screen.dart';

class AppRouter {
  static const String baseUrl = AppConfig.apiBaseUrl;
  static final SessionStore sessionStore = SessionStore();

  static Route<dynamic> onGenerateRoute(RouteSettings settings) {
    final name = settings.name ?? '/';
    final api = CommunityApiClient(baseUrl: baseUrl);

    if (name == '/' || name == '/splash') {
      return MaterialPageRoute(builder: (_) => SplashScreen(sessionStore: sessionStore));
    }

    if (name == '/login') {
      return MaterialPageRoute(
        builder: (_) => LoginScreen(api: api, sessionStore: sessionStore),
      );
    }

    if (name == '/workspace-select') {
      final args = settings.arguments as Map<String, dynamic>;
      return MaterialPageRoute(
        builder: (_) => WorkspaceSelectScreen(
          api: api,
          sessionStore: sessionStore,
          token: args['token'] as String,
          role: args['role'] as String,
        ),
      );
    }

    if (name == '/register') {
      final args = settings.arguments as Map<String, dynamic>;
      return MaterialPageRoute(
        builder: (_) => RegisterScreen(
          api: api,
          sessionStore: sessionStore,
          token: args['token'] as String,
          role: args['role'] as String,
        ),
      );
    }

    if (name == '/home') {
      final args = settings.arguments as Map<String, dynamic>;
      return MaterialPageRoute(
        builder: (_) => HomeShell(
          api: api,
          sessionStore: sessionStore,
          token: args['token'] as String,
          role: args['role'] as String,
        ),
      );
    }

    if (name == '/hourly/start') {
      final args = settings.arguments as Map<String, dynamic>? ?? {};
      final token = args['token'] as String? ?? '';
      return MaterialPageRoute(
        builder: (_) => HourlyStartScreen(
          api: api,
          token: token,
          onUnauthorized: () async {
            await sessionStore.clearSession();
          },
        ),
      );
    }

    if (name == '/hourly/end') {
      final args = settings.arguments as Map<String, dynamic>;
      return MaterialPageRoute(
        builder: (_) => HourlyEndScreen(
          api: api,
          token: args['token'] as String,
          logId: args['logId'] as int,
          startedAt: DateTime.parse(args['startedAt'] as String),
          equipmentLabel: args['equipmentLabel'] as String? ?? '—',
          onUnauthorized: () async {
            await sessionStore.clearSession();
          },
        ),
      );
    }

    return MaterialPageRoute(builder: (_) => SplashScreen(sessionStore: sessionStore));
  }
}
