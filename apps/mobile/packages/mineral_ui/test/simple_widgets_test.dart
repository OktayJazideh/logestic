import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mineral_ui/mineral_ui.dart';

void main() {
  testWidgets('StepProgressBar shows مرحله N از M', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StepProgressBar(
            currentStepIndex: 2,
            labels: const ['الف', 'ب', 'ج', 'د'],
          ),
        ),
      ),
    );
    expect(find.text('مرحله 3 از 4'), findsOneWidget);
    expect(find.text('ب'), findsOneWidget);
  });

  testWidgets('BigActionButton has min height 56', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: BigActionButton(label: 'ادامه', onPressed: () {}),
        ),
      ),
    );
    final box = tester.getSize(find.byType(FilledButton));
    expect(box.height, MineralTheme.primaryCtaHeight);
  });

  testWidgets('PlainLanguageError shows retry', (tester) async {
    var retried = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PlainLanguageError(
            message: 'خطا',
            whatToDo: 'دوباره تلاش کنید.',
            onRetry: () => retried = true,
          ),
        ),
      ),
    );
    expect(find.textContaining('چکار کنم؟'), findsOneWidget);
    await tester.tap(find.text('تلاش مجدد'));
    expect(retried, isTrue);
  });

  test('simpleLabel returns Fa copy', () {
    expect(simpleLabel('geofence'), 'محدوده معدن / کارخانه');
  });
}
