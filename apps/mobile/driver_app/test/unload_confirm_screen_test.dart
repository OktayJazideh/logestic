import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mineral_api/mineral_api.dart';

import 'package:driver_app/core/connectivity_service.dart';
import 'package:driver_app/core/driver_api_client.dart';
import 'package:driver_app/models/api_models.dart';
import 'package:driver_app/ui/screens/unload_confirm_screen.dart';

DriverMission _inTransitMission() {
  return DriverMission(
    id: 7,
    loadId: 1,
    mineId: 2,
    ownerId: 3,
    driverId: 4,
    vehicleId: 5,
    status: 'IN_TRANSIT',
    destination: 'کارخانه شمال',
    employerContact: '09121234567',
  );
}

void main() {
  testWidgets('confirm button disabled until both checkboxes checked', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: MineralTheme.lightTheme,
        home: UnloadConfirmScreen(
          api: DriverApiClient(baseUrl: 'http://test'),
          token: 't',
          missionId: 7,
          destination: 'کارخانه شمال',
          employerContact: '09121234567',
          latitude: 35.7,
          longitude: 51.4,
          loadMission: () async => _inTransitMission(),
          connectivity: _AlwaysOnlineConnectivity(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final confirmFinder = find.widgetWithText(FilledButton, 'تأیید تحویل');
    final confirmButton = tester.widget<FilledButton>(confirmFinder);
    expect(confirmButton.onPressed, isNull);

    await tester.tap(find.text('تخلیه کامل شد'));
    await tester.pump();
    expect(tester.widget<FilledButton>(confirmFinder).onPressed, isNull);

    await tester.tap(find.text('مغایرت ندارم'));
    await tester.pump();
    expect(tester.widget<FilledButton>(confirmFinder).onPressed, isNotNull);
  });

  testWidgets('shows destination and employer contact', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: MineralTheme.lightTheme,
        home: UnloadConfirmScreen(
          api: DriverApiClient(baseUrl: 'http://test'),
          token: 't',
          missionId: 7,
          loadMission: () async => _inTransitMission(),
          connectivity: _AlwaysOnlineConnectivity(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('کارخانه شمال'), findsOneWidget);
    expect(find.text('09121234567'), findsOneWidget);
    expect(find.text('ورود به کارخانه تأیید شد'), findsNothing);
  });
}

class _AlwaysOnlineConnectivity extends ConnectivityService {
  _AlwaysOnlineConnectivity() : super(onlineProbe: () async => true);

  @override
  void start() {}

  @override
  void dispose() {}
}
