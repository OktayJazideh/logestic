import 'package:flutter/material.dart';
import 'package:driver_app/theme/mineral_theme.dart';
import 'package:driver_app/ui/router.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const DriverApp());
}

class DriverApp extends StatelessWidget {
  const DriverApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Mineral Haul Platform',
      theme: MineralTheme.lightTheme,
      initialRoute: '/splash',
      onGenerateRoute: AppRouter.onGenerateRoute,
    );
  }
}

