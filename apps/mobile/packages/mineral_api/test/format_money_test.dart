import 'package:flutter_test/flutter_test.dart';
import 'package:mineral_api/mineral_api.dart';

void main() {
  test('formatMoney converts rial to toman', () {
    expect(formatMoney(10000), '۱٬۰۰۰ تومان');
    expect(formatMoney(500000), '۵۰٬۰۰۰ تومان');
  });
}
