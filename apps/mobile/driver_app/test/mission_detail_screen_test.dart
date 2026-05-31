import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mineral_api/mineral_api.dart';

import 'package:driver_app/core/driver_api_client.dart';
import 'package:driver_app/core/mission_flow.dart';
import 'package:driver_app/models/api_models.dart';
import 'package:driver_app/models/mission_detail_display.dart';
import 'package:driver_app/ui/screens/mission_detail_screen.dart';

DriverMission _mission(String status) {
  return DriverMission(
    id: 42,
    loadId: 1,
    mineId: 2,
    ownerId: 3,
    driverId: 4,
    vehicleId: 5,
    status: status,
  );
}

void main() {
  testWidgets('shows 7-step stepper and detail card', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: MineralTheme.lightTheme,
        home: MissionDetailScreen(
          api: DriverApiClient(baseUrl: 'http://test'),
          token: 't',
          missionId: 42,
          sessionStore: SessionStore(),
          display: const MissionDetailDisplay(
            licensePlate: '12ب345-67',
            destination: 'کارخانه شمال',
            approximateWeightKg: 24.5,
          ),
          loadMission: () async => _mission('ASSIGNED'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(MissionDetailScreen), findsOneWidget);
    for (final label in MissionFlow.uiStepLabelsFa) {
      expect(find.text(label), findsOneWidget);
    }
    expect(find.text('LOAD-1'), findsOneWidget);
    expect(find.text('MSN-0042'), findsOneWidget);
    expect(find.text('12ب345-67'), findsOneWidget);
    expect(find.text('کارخانه شمال'), findsOneWidget);
    expect(find.text('24.5 تن'), findsOneWidget);
    expect(find.text('پذیرش ماموریت'), findsOneWidget);
  });

  testWidgets('ACCEPTED routes to geofence not direct advance label', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: MineralTheme.lightTheme,
        routes: {
          '/mine-entry': (_) => const Scaffold(body: Text('mine-entry')),
        },
        home: MissionDetailScreen(
          api: DriverApiClient(baseUrl: 'http://test'),
          token: 't',
          missionId: 42,
          sessionStore: SessionStore(),
          loadMission: () async => _mission('ACCEPTED'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('ثبت ورود به معدن'), findsOneWidget);
    await tester.tap(find.text('ثبت ورود به معدن'));
    await tester.pumpAndSettle();
    expect(find.text('mine-entry'), findsOneWidget);
  });

  testWidgets('IN_TRANSIT routes to in-transit screen not factory-entry', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: MineralTheme.lightTheme,
        routes: {
          '/mission/42/in-transit': (_) => const Scaffold(body: Text('in-transit')),
        },
        home: MissionDetailScreen(
          api: DriverApiClient(baseUrl: 'http://test'),
          token: 't',
          missionId: 42,
          sessionStore: SessionStore(),
          loadMission: () async => _mission('IN_TRANSIT'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('رسیدم به مقصد'), findsOneWidget);
    await tester.tap(find.text('رسیدم به مقصد'));
    await tester.pumpAndSettle();
    expect(find.text('in-transit'), findsOneWidget);
  });
}
