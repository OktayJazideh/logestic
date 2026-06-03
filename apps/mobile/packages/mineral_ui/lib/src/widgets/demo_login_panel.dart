import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

import '../../mineral_theme.dart';

typedef DemoLoginHandler = Future<void> Function(DemoPersona persona);

/// UAT one-tap login — visible on debug, ENABLE_DEMO_LOGIN, or staging IP API.
class DemoLoginPanel extends StatelessWidget {
  const DemoLoginPanel({
    super.key,
    required this.app,
    required this.onDemoLogin,
    this.busy = false,
  });

  final String app;
  final DemoLoginHandler onDemoLogin;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    if (!isDemoLoginEnabled()) return const SizedBox.shrink();

    final personas = demoPersonasForApp(app);
    if (personas.isEmpty) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.only(top: 20),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: MineralTheme.panelMuted,
        borderRadius: BorderRadius.circular(MineralTheme.radiusLg),
        border: Border.all(color: MineralTheme.border, style: BorderStyle.solid),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'ورود دمو (UAT)',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: MineralTheme.primaryDark),
          ),
          const SizedBox(height: 6),
          const Text(
            'نیاز: db:seed · SMS mock · NODE_ENV=development',
            style: TextStyle(fontSize: 11, color: MineralTheme.muted, height: 1.4),
          ),
          const SizedBox(height: 10),
          ...personas.map(
            (p) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: OutlinedButton(
                onPressed: busy ? null : () => onDemoLogin(p),
                style: OutlinedButton.styleFrom(
                  alignment: Alignment.centerRight,
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(p.roleLabel, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                    Text(p.mobile, style: const TextStyle(fontSize: 11, color: MineralTheme.muted)),
                    Text(p.workspaceHint, style: const TextStyle(fontSize: 10, color: MineralTheme.muted)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
