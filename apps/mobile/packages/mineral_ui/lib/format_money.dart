/// Formats Rial amounts for UI display (DB/API store Rial).
String formatMoney(
  num rial, {
  String unit = 'toman',
  String? display,
  bool showUnit = true,
}) {
  final resolvedUnit = display ?? unit;
  final amount = resolvedUnit == 'toman' ? rialToToman(rial) : _safeRial(rial);
  final formatted = _formatFa(amount);
  if (!showUnit) return formatted;
  return '$formatted ${resolvedUnit == 'toman' ? 'تومان' : 'ریال'}';
}

/// Display-only conversion; never persist Toman in DB.
int rialToToman(num rial) {
  if (!rial.isFinite || rial < 0) return 0;
  return (rial / 10).floor();
}

int _safeRial(num rial) {
  if (!rial.isFinite || rial < 0) return 0;
  return rial.round();
}

String _formatFa(int n) {
  final negative = n < 0;
  final abs = n.abs();
  final digits = abs.toString();
  final buf = StringBuffer();
  if (negative) buf.write('−');
  const persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buf.write('٬');
    buf.write(persian[int.parse(digits[i])]);
  }
  return buf.toString();
}
