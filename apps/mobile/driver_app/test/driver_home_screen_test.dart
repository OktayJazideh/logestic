import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mineral_api/mineral_api.dart';

import 'package:driver_app/core/driver_api_client.dart';
import 'package:driver_app/models/api_models.dart';
import 'package:driver_app/ui/screens/driver_home_screen.dart';

DriverDashboard _dashboard({
  required String state,
  DriverDashboardMission? active,
  List<DriverDashboardMission> history = const [],
}) {
  return DriverDashboard(
    state: state,
    driver: const DriverDashboardDriver(fullName: 'علی رضایی', driverCode: 'DRV-4412'),
    summary: const DriverDashboardSummary(
      todayTrips: 2,
      todayDeliveries: 1,
      todayKm: 0,
      pendingSettlement: 1,
    ),
    activeMission: active,
    recentHistory: history,
  );
}

DriverDashboardMission _mission({int id = 1, String status = 'IN_TRANSIT'}) {
  return DriverDashboardMission(
    id: id,
    status: status,
    origin: 'معدن آهن',
    destination: 'روستای شمال',
    materialType: 'سنگ آهن',
  );
}

Widget _wrap(Widget child) {
  return MaterialApp(
    theme: MineralTheme.lightTheme,
    home: child,
  );
}

void main() {
  group('DriverHomeScreen', () {
    testWidgets('IDLE shows empty mission card', (tester) async {
      await tester.pumpWidget(
        _wrap(
          DriverHomeScreen(
            api: DriverApiClient(baseUrl: 'http://test'),
            token: 't',
            sessionStore: SessionStore(),
            loadDashboard: () async => _dashboard(state: 'IDLE'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('مأموریتی ندارید'), findsOneWidget);
      expect(find.text('ادامه مأموریت'), findsNothing);
      expect(find.text('منتظر تأیید باسکول'), findsNothing);
    });

    testWidgets('ACTIVE shows mission card and continue CTA', (tester) async {
      await tester.pumpWidget(
        _wrap(
          DriverHomeScreen(
            api: DriverApiClient(baseUrl: 'http://test'),
            token: 't',
            sessionStore: SessionStore(),
            loadDashboard: () async => _dashboard(
              state: 'ACTIVE',
              active: _mission(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('علی رضایی'), findsOneWidget);
      expect(find.text('DRV-4412'), findsOneWidget);
      expect(find.text('ادامه مأموریت'), findsOneWidget);
      expect(find.textContaining('معدن آهن'), findsWidgets);
      expect(find.text('منتظر تأیید باسکول'), findsNothing);
    });

    testWidgets('AWAITING_WB shows orange banner without continue CTA', (tester) async {
      await tester.pumpWidget(
        _wrap(
          DriverHomeScreen(
            api: DriverApiClient(baseUrl: 'http://test'),
            token: 't',
            sessionStore: SessionStore(),
            loadDashboard: () async => _dashboard(
              state: 'AWAITING_WB',
              active: _mission(status: 'DELIVERED'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('منتظر تأیید باسکول'), findsOneWidget);
      expect(find.text('ادامه مأموریت'), findsNothing);
    });

    testWidgets('IDLE with history shows recent list', (tester) async {
      await tester.pumpWidget(
        _wrap(
          DriverHomeScreen(
            api: DriverApiClient(baseUrl: 'http://test'),
            token: 't',
            sessionStore: SessionStore(),
            loadDashboard: () async => _dashboard(
              state: 'IDLE',
              history: [_mission(id: 9, status: 'SETTLED')],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('تاریخچه اخیر'), findsOneWidget);
      expect(find.textContaining('روستای شمال'), findsWidgets);
    });
  });
}
