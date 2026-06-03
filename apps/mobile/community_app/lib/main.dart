import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

import 'ui/router.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const CommunityApp());
}

class CommunityApp extends StatelessWidget {
  const CommunityApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: BrandNames.communityAppTitle,
      theme: MineralTheme.lightTheme,
      initialRoute: '/splash',
      onGenerateRoute: AppRouter.onGenerateRoute,
    );
  }
}
