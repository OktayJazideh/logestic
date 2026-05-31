import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mineral_api/mineral_api.dart';

import 'package:driver_app/core/mission_flow.dart';
import 'package:driver_app/ui/widgets/mission_stepper.dart';

void main() {
  testWidgets('MissionStepper renders 7 Fa labels', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: MineralTheme.lightTheme,
        home: const Scaffold(
          body: MissionStepper(
            currentStepIndex: 2,
            labels: MissionFlow.uiStepLabelsFa,
          ),
        ),
      ),
    );

    for (final label in MissionFlow.uiStepLabelsFa) {
      expect(find.text(label), findsOneWidget);
    }
    expect(find.text('3'), findsOneWidget);
  });

  testWidgets('completed steps show check icon', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: MineralTheme.lightTheme,
        home: const Scaffold(
          body: MissionStepper(
            currentStepIndex: 4,
            labels: MissionFlow.uiStepLabelsFa,
          ),
        ),
      ),
    );

    expect(find.byIcon(Icons.check), findsNWidgets(4));
  });
}
