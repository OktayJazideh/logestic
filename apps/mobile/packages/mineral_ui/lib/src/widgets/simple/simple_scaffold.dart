import 'package:flutter/material.dart';

import '../../../mineral_theme.dart';
import '../logout_app_bar_button.dart';

/// AppBar · status · body · sticky bottom CTA (UX-SIMPLE-SPEC-1 §۵).
class SimpleScaffold extends StatelessWidget {
  const SimpleScaffold({
    super.key,
    required this.title,
    required this.body,
    this.status,
    this.bottomBar,
    this.onLogout,
    this.leading,
    this.actions,
    this.secondaryLink,
    this.backgroundColor,
  });

  final String title;
  final Widget body;
  final Widget? status;
  final Widget? bottomBar;
  final Future<void> Function()? onLogout;
  final Widget? leading;
  final List<Widget>? actions;
  final Widget? secondaryLink;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    final barActions = <Widget>[
      ...?actions,
      if (onLogout != null) LogoutAppBarButton(onLogout: onLogout!),
    ];

    return Scaffold(
      backgroundColor: backgroundColor ?? MineralTheme.bg,
      appBar: AppBar(
        title: Text(title),
        leading: leading,
        actions: barActions.isEmpty ? null : barActions,
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (status != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: status!,
            ),
          Expanded(child: body),
          if (bottomBar != null)
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    bottomBar!,
                    if (secondaryLink != null) ...[
                      const SizedBox(height: 8),
                      Center(child: secondaryLink!),
                    ],
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
