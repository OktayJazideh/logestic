import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// On login (root route): system back exits the app instead of returning to splash.
class ExitAppOnBackScope extends StatelessWidget {
  const ExitAppOnBackScope({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        SystemNavigator.pop();
      },
      child: child,
    );
  }
}
