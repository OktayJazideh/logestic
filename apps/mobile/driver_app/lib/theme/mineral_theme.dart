import 'package:flutter/material.dart';

class MineralTheme {
  static const Color bg = Color(0xFFF3F4F6);
  static const Color panel = Color(0xFFFFFFFF);
  static const Color border = Color(0xFFE5E7EB);

  // Mining/industrial corporate palette (flat colors, no gradients).
  static const Color primary = Color(0xFF1B5E20);
  static const Color primaryDark = Color(0xFF0E3B13);
  static const Color accent = Color(0xFFF59E0B); // amber
  static const Color danger = Color(0xFFB91C1C);
  static const Color muted = Color(0xFF6B7280);

  static ThemeData lightTheme = ThemeData(
    scaffoldBackgroundColor: bg,
    colorScheme: const ColorScheme.light(
      primary: primary,
      primaryContainer: Color(0xFFE8F5E9),
      secondary: accent,
      surface: panel,
      background: bg,
      error: danger,
    ),
    cardTheme: const CardTheme(
      color: panel,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
      ),
      elevation: 0,
    ),
    dividerTheme: const DividerThemeData(color: border, thickness: 1),
    appBarTheme: const AppBarTheme(
      backgroundColor: panel,
      foregroundColor: primaryDark,
      elevation: 0,
      centerTitle: false,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: primary, width: 1.5),
      ),
    ),
    textTheme: const TextTheme(
      bodyMedium: TextStyle(color: Colors.black87),
    ),
  );
}

