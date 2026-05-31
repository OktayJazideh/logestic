import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mineral_api/mineral_api.dart';

import 'package:driver_app/core/driver_api_client.dart';
import 'package:driver_app/models/api_models.dart';
import 'package:driver_app/ui/screens/in_transit_screen.dart';
import 'package:driver_app/ui/widgets/in_transit_map_panel.dart';

DriverMission _inTransitMission() {
  return DriverMission(
    id: 42,
    loadId: 1,
    mineId: 2,
    ownerId: 3,
    driverId: 4,
    vehicleId: 5,
    status: 'IN_TRANSIT',
    origin: 'معدن تفتان',
    destination: 'کارخانه شمال',
    employerContact: '09121234567',
    mineLat: 27.0,
    mineLng: 55.0,
    factoryLat: 27.05,
    factoryLng: 55.05,
  );
}

void main() {
  testWidgets('map panel shows mine and factory markers', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: MineralTheme.lightTheme,
        home: InTransitMapPanel(
          mineLat: 27,
          mineLng: 55,
          factoryLat: 27.05,
          factoryLng: 55.05,
        ),
      ),
    );
    await tester.pump();

    expect(find.byKey(const ValueKey('marker-mine')), findsOneWidget);
    expect(find.byKey(const ValueKey('marker-factory')), findsOneWidget);
  });

  testWidgets('IN_TRANSIT screen shows ETA, CTA, and markers', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: MineralTheme.lightTheme,
        routes: {
          '/factory-entry': (_) => const Scaffold(body: Text('factory-entry')),
        },
        home: InTransitScreen(
          api: DriverApiClient(baseUrl: 'http://test'),
          token: 't',
          missionId: 42,
          loadMission: () async => _inTransitMission(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('marker-mine')), findsOneWidget);
    expect(find.byKey(const ValueKey('marker-factory')), findsOneWidget);
    expect(find.textContaining('تقریبی'), findsOneWidget);
    expect(find.text('رسیدم به مقصد'), findsOneWidget);

    await tester.tap(find.text('رسیدم به مقصد'));
    await tester.pumpAndSettle();
    expect(find.text('factory-entry'), findsOneWidget);
  });

  testWidgets('router guard pops when status is not IN_TRANSIT', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: MineralTheme.lightTheme,
        home: Builder(
          builder: (context) {
            return Scaffold(
              body: FilledButton(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => InTransitScreen(
                        api: DriverApiClient(baseUrl: 'http://test'),
                        token: 't',
                        missionId: 42,
                        loadMission: () async => _inTransitMission().copyWith(status: 'LOADED'),
                      ),
                    ),
                  );
                },
                child: const Text('open'),
              ),
            );
          },
        ),
      ),
    );

    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.text('open'), findsOneWidget);
  });
}
