import 'package:flutter/material.dart';

import '../core/app_config.dart';
import '../core/api_client.dart';
import '../core/session_store.dart';
import 'screens/login_screen.dart';
import 'screens/mine_select_screen.dart';
import 'screens/missions_screen.dart';
import 'screens/splash_screen.dart';
import 'screens/ticket_status_screen.dart';

class AppRouter {
  static const String baseUrl = AppConfig.apiBaseUrl;
  static final SessionStore sessionStore = SessionStore();

  static Route<dynamic> onGenerateRoute(RouteSettings settings) {
    final name = settings.name ?? '/';

    // All screens share the same API client config.
    final api = ApiClient(baseUrl: baseUrl);

    if (name == '/' || name == '/splash') {
      return MaterialPageRoute(builder: (_) => SplashScreen(sessionStore: sessionStore));
    }

    if (name == '/login') {
      return MaterialPageRoute(
        builder: (_) => LoginScreen(api: api, sessionStore: sessionStore),
      );
    }

    if (name == '/mine-select') {
      final token = settings.arguments as String;
      return MaterialPageRoute(
        builder: (_) => MineSelectScreen(
          api: api,
          token: token,
          sessionStore: sessionStore,
        ),
      );
    }

    if (name == '/missions') {
      final token = settings.arguments as String;
      return MaterialPageRoute(
        builder: (_) => MissionsScreen(
          api: api,
          token: token,
          sessionStore: sessionStore,
        ),
      );
    }

    if (name == '/ticket') {
      final args = settings.arguments as Map<String, dynamic>;
      return MaterialPageRoute(
        builder: (_) => TicketStatusScreen(
          api: api,
          sessionStore: sessionStore,
          token: args['token'] as String,
          missionId: args['missionId'] as int,
        ),
      );
    }

    return MaterialPageRoute(builder: (_) => SplashScreen(sessionStore: sessionStore));
  }
}

