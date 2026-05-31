import 'package:flutter/material.dart';

/// Formal solid palette — wireframe / old-money style. No gradients in theme defaults.
class MineralTheme {
  static const String fontFamily = 'Vazirmatn';

  static const Color bg = Color(0xFFF7F6F2);
  static const Color panel = Color(0xFFFFFFFF);
  static const Color panelMuted = Color(0xFFF3F1EB);
  static const Color border = Color(0xFFD8D4CC);

  static const Color primary = Color(0xFF1E3A2F);
  static const Color primaryDark = Color(0xFF152921);
  static const Color primaryLight = Color(0xFFE8EDE9);

  static const Color accent = Color(0xFF6B5B4F);
  static const Color danger = Color(0xFF7F1D1D);
  static const Color muted = Color(0xFF5C5C5C);

  static TextTheme _textTheme(Color body) {
    return TextTheme(
      headlineSmall: const TextStyle(fontFamily: fontFamily, fontWeight: FontWeight.w700, color: primaryDark),
      titleMedium: const TextStyle(fontFamily: fontFamily, fontWeight: FontWeight.w600, color: primaryDark),
      bodyMedium: TextStyle(fontFamily: fontFamily, color: body),
      bodySmall: const TextStyle(fontFamily: fontFamily, color: muted),
      labelLarge: const TextStyle(fontFamily: fontFamily, fontWeight: FontWeight.w600),
    );
  }

  static ThemeData lightTheme = ThemeData(
    fontFamily: fontFamily,
    scaffoldBackgroundColor: bg,
    colorScheme: const ColorScheme.light(
      primary: primary,
      onPrimary: Colors.white,
      primaryContainer: primaryLight,
      secondary: accent,
      surface: panel,
      onSurface: Color(0xFF1C1C1C),
      error: danger,
    ),
    cardTheme: const CardThemeData(
      color: panel,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(8)),
        side: BorderSide(color: border),
      ),
    ),
    dividerTheme: const DividerThemeData(color: border, thickness: 1),
    appBarTheme: const AppBarTheme(
      backgroundColor: panel,
      foregroundColor: primaryDark,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontFamily: fontFamily,
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: primaryDark,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        textStyle: const TextStyle(fontFamily: fontFamily, fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: primary,
        textStyle: const TextStyle(fontFamily: fontFamily, fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: panel,
      labelStyle: const TextStyle(fontFamily: fontFamily, color: muted),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: const BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: const BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: const BorderSide(color: primary, width: 1.5),
      ),
    ),
    textTheme: _textTheme(const Color(0xFF1C1C1C)),
  );
}
