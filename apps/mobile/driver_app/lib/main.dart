import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:mineral_api/mineral_api.dart';
import 'package:driver_app/ui/router.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter();
  runApp(const DriverApp());
}

class DriverApp extends StatelessWidget {
  const DriverApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'سیستم لجستیک معادن — راننده',
      theme: MineralTheme.lightTheme,
      initialRoute: '/splash',
      onGenerateRoute: AppRouter.onGenerateRoute,
    );
  }
}

