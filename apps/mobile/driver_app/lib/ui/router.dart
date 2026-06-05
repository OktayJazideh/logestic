import 'package:flutter/material.dart';

import 'package:mineral_api/mineral_api.dart';

import '../core/driver_api_client.dart';
import 'screens/kyc_pending_screen.dart';
import 'screens/login_screen.dart';
import 'screens/mine_select_screen.dart';
import 'screens/driver_home_screen.dart';
import 'screens/mine_entry_screen.dart';
import 'screens/factory_entry_screen.dart';
import 'screens/in_transit_screen.dart';
import 'screens/mission_detail_screen.dart';
import 'screens/missions_screen.dart';
import 'screens/unload_confirm_screen.dart';
import '../models/mission_detail_display.dart';
import 'screens/splash_screen.dart';
import 'screens/suspended_screen.dart';
import 'screens/ticket_status_screen.dart';
import 'screens/weighbridge_read_screen.dart';

class AppRouter {
  static const String baseUrl = AppConfig.apiBaseUrl;
  static final SessionStore sessionStore = SessionStore();

  static Route<dynamic> onGenerateRoute(RouteSettings settings) {
    final name = settings.name ?? '/';
    final api = DriverApiClient(baseUrl: baseUrl);

    if (name == '/' || name == '/splash') {
      return MaterialPageRoute(builder: (_) => SplashScreen(sessionStore: sessionStore));
    }

    if (name == '/login') {
      return MaterialPageRoute(
        builder: (_) => LoginScreen(api: api, sessionStore: sessionStore),
      );
    }

    if (name == '/kyc-pending') {
      final token = settings.arguments as String;
      return MaterialPageRoute(
        builder: (_) => KycPendingScreen(
          api: api,
          token: token,
          sessionStore: sessionStore,
        ),
      );
    }

    if (name == '/suspended') {
      return MaterialPageRoute(
        builder: (_) => SuspendedScreen(sessionStore: sessionStore),
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

    if (name == '/home') {
      final token = settings.arguments as String;
      return MaterialPageRoute(
        builder: (_) => DriverHomeScreen(
          api: api,
          token: token,
          sessionStore: sessionStore,
        ),
      );
    }

    if (name == '/missions') {
      final args = settings.arguments;
      final String token;
      if (args is Map<String, dynamic>) {
        token = args['token'] as String;
      } else {
        token = args as String;
      }
      return MaterialPageRoute(
        builder: (_) => MissionsScreen(
          api: api,
          token: token,
          sessionStore: sessionStore,
        ),
      );
    }

    if (name == '/mission-detail') {
      final args = settings.arguments as Map<String, dynamic>;
      return MaterialPageRoute(
        builder: (_) => MissionDetailScreen(
          api: api,
          token: args['token'] as String,
          missionId: args['missionId'] as int,
          sessionStore: sessionStore,
          display: args['display'] as MissionDetailDisplay?,
        ),
      );
    }

    if (name == '/mine-entry') {
      final args = settings.arguments as Map<String, dynamic>;
      return MaterialPageRoute(
        builder: (_) => MineEntryScreen(
          api: api,
          token: args['token'] as String,
          missionId: args['missionId'] as int,
          sessionStore: sessionStore,
        ),
      );
    }

    final inTransitMatch = RegExp(r'^/mission/(\d+)/in-transit$').firstMatch(name);
    if (inTransitMatch != null) {
      final args = settings.arguments as Map<String, dynamic>?;
      final missionId = int.parse(inTransitMatch.group(1)!);
      return MaterialPageRoute(
        builder: (_) => InTransitScreen(
          api: api,
          token: (args?['token'] as String?) ?? '',
          missionId: args?['missionId'] as int? ?? missionId,
          awaitingWb: args?['awaiting_wb'] as bool? ?? false,
          sessionStore: sessionStore,
        ),
      );
    }

    if (name == '/factory-entry') {
      final args = settings.arguments as Map<String, dynamic>;
      return MaterialPageRoute(
        builder: (_) => FactoryEntryScreen(
          api: api,
          token: args['token'] as String,
          missionId: args['missionId'] as int,
          destination: args['destination'] as String?,
          employerContact: args['employer_contact'] as String?,
          sessionStore: sessionStore,
        ),
      );
    }

    if (name == '/unload-confirm') {
      final args = settings.arguments as Map<String, dynamic>;
      return MaterialPageRoute(
        builder: (_) => UnloadConfirmScreen(
          api: api,
          token: args['token'] as String,
          missionId: args['missionId'] as int,
          sessionStore: sessionStore,
          destination: args['destination'] as String?,
          employerContact: args['employer_contact'] as String?,
          latitude: (args['latitude'] as num?)?.toDouble(),
          longitude: (args['longitude'] as num?)?.toDouble(),
          accuracyM: (args['accuracy_m'] as num?)?.toDouble(),
          distanceM: (args['distance_m'] as num?)?.toDouble(),
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

    final weighbridgeMatch = RegExp(r'^/missions/(\d+)/weighbridge$').firstMatch(name);
    if (weighbridgeMatch != null) {
      final args = settings.arguments as Map<String, dynamic>?;
      final missionId = int.parse(weighbridgeMatch.group(1)!);
      return MaterialPageRoute(
        builder: (_) => WeighbridgeReadScreen(
          api: api,
          sessionStore: sessionStore,
          token: (args?['token'] as String?) ?? '',
          missionId: args?['missionId'] as int? ?? missionId,
        ),
      );
    }

    return MaterialPageRoute(builder: (_) => SplashScreen(sessionStore: sessionStore));
  }
}
