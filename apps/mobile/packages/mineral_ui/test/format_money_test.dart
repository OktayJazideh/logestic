import 'package:flutter_test/flutter_test.dart';
import 'package:mineral_ui/format_money.dart';

void main() {
  test('formatMoney converts rial to toman with Persian digits', () {
    expect(formatMoney(10000), '۱٬۰۰۰ تومان');
    expect(formatMoney(500000), '۵۰٬۰۰۰ تومان');
  });

  test('zero and negative guard', () {
    expect(formatMoney(0), '۰ تومان');
    expect(formatMoney(-10000), '۰ تومان');
    expect(rialToToman(-100), 0);
  });
}
