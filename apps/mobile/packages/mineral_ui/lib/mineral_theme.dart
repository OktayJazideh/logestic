import 'package:flutter/material.dart';

/// همسهمان — پالت رسمی، هم‌راستا با apps/web/src/theme.ts
class MineralTheme {
  static const String fontFamily = 'Vazirmatn';

  static const Color bg = Color(0xFFF7F8FA);
  static const Color panel = Color(0xFFFFFFFF);
  static const Color panelMuted = Color(0xFFF0EDE6);
  static const Color border = Color(0xFFE2DDD4);
  static const Color borderDark = Color(0xFFC4BCB0);

  static const Color primary = Color(0xFF1E3A2F);
  static const Color primaryDark = Color(0xFF152921);
  static const Color primaryLight = Color(0xFFE6EFEA);
  static const Color primaryMuted = Color(0xFFD4E4DC);

  static const Color accent = Color(0xFF6B5B4F);
  static const Color danger = Color(0xFF7F1D1D);
  static const Color muted = Color(0xFF5A5650);

  static const double radiusSm = 8;
  static const double radiusMd = 12;
  static const double radiusLg = 14;

  static TextTheme _textTheme(Color body) {
    return TextTheme(
      headlineSmall: const TextStyle(fontFamily: fontFamily, fontWeight: FontWeight.w700, color: primaryDark, fontSize: 22),
      titleMedium: const TextStyle(fontFamily: fontFamily, fontWeight: FontWeight.w600, color: primaryDark, fontSize: 16),
      bodyMedium: TextStyle(fontFamily: fontFamily, color: body, fontSize: 15, height: 1.5),
      bodySmall: const TextStyle(fontFamily: fontFamily, color: muted, fontSize: 13),
      labelLarge: const TextStyle(fontFamily: fontFamily, fontWeight: FontWeight.w600, fontSize: 14),
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
      onSurface: Color(0xFF1A1A1A),
      error: danger,
    ),
    cardTheme: CardThemeData(
      color: panel,
      elevation: 0,
      margin: const EdgeInsets.symmetric(vertical: 6),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(radiusLg)),
        side: const BorderSide(color: border),
      ),
    ),
    dividerTheme: const DividerThemeData(color: border, thickness: 1),
    appBarTheme: const AppBarTheme(
      backgroundColor: primaryDark,
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontFamily: fontFamily,
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: Colors.white,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        elevation: 0,
        minimumSize: const Size(0, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusMd)),
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
        textStyle: const TextStyle(fontFamily: fontFamily, fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: primaryDark,
        side: const BorderSide(color: border),
        minimumSize: const Size(0, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusMd)),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
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
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      labelStyle: const TextStyle(fontFamily: fontFamily, color: muted, fontSize: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radiusMd),
        borderSide: const BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radiusMd),
        borderSide: const BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radiusMd),
        borderSide: const BorderSide(color: primary, width: 1.5),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: panel,
      indicatorColor: primaryLight,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          fontFamily: fontFamily,
          fontSize: 12,
          fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
          color: states.contains(WidgetState.selected) ? primaryDark : muted,
        ),
      ),
    ),
    textTheme: _textTheme(const Color(0xFF1A1A1A)),
  );
}
