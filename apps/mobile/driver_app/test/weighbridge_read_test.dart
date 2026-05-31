import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mineral_api/mineral_api.dart';

import 'package:driver_app/core/driver_api_client.dart';
import 'package:driver_app/models/api_models.dart';
import 'package:driver_app/ui/screens/weighbridge_read_screen.dart';
import 'package:driver_app/ui/widgets/weighbridge_read_stepper.dart';

DriverWeighbridgeStatus _status({
  bool paymentHold = false,
  String entrySource = 'OPERATOR',
}) {
  return DriverWeighbridgeStatus(
    ticketStatus: paymentHold ? 'LOADED_REGISTERED' : 'APPROVED',
    emptyWeightKg: 12000,
    loadedWeightKg: 45000,
    netWeightKg: paymentHold ? null : 33000,
    entrySource: entrySource,
    holdPercent: 5,
    paymentHold: paymentHold,
    holdReason: paymentHold ? 'انحراف وزن' : null,
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory tempDir;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('wb_read_test');
    Hive.init(tempDir.path);
  });

  tearDown(() async {
    await Hive.deleteFromDisk();
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  testWidgets('shows hold banner and weight cards', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: MineralTheme.lightTheme,
        home: WeighbridgeReadScreen(
          api: DriverApiClient(baseUrl: 'http://test'),
          sessionStore: SessionStore(),
          token: 't',
          missionId: 42,
          loadStatus: () async => _status(paymentHold: true),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('وضعیت باسکول'), findsOneWidget);
    expect(find.text('۵٪ کرایه تا بررسی عملیات مسدود است'), findsOneWidget);
    expect(find.text('وزن خالی'), findsOneWidget);
    expect(find.text('وزن پر'), findsOneWidget);
    expect(find.text('وزن خالص'), findsOneWidget);
    expect(find.textContaining('کیلوگرم'), findsWidgets);
    expect(find.byType(FloatingActionButton), findsNothing);
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('shows manual entry badge', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: MineralTheme.lightTheme,
        home: WeighbridgeReadScreen(
          api: DriverApiClient(baseUrl: 'http://test'),
          sessionStore: SessionStore(),
          token: 't',
          missionId: 42,
          loadStatus: () async => _status(entrySource: 'MANUAL'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('ثبت دستی — در حال بررسی'), findsOneWidget);
  });

  testWidgets('horizontal stepper highlights loaded step', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: MineralTheme.lightTheme,
        home: const Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(
            body: WeighbridgeReadStepper(ticketStatus: 'LOADED_REGISTERED'),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('خالی'), findsOneWidget);
    expect(find.text('پر'), findsOneWidget);
    expect(find.text('تأیید'), findsOneWidget);
  });

}
