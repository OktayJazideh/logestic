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

    final primary = primaryDemoPersonaForApp(app);

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
            'یک‌کلیک ورود بدون پیامک — مستقیم به داشبورد. نیاز: db:seed · NODE_ENV=development',
            style: TextStyle(fontSize: 11, color: MineralTheme.muted, height: 1.4),
          ),
          if (primary != null) ...[
            const SizedBox(height: 12),
            SizedBox(
              height: MineralTheme.buttonHeight,
              child: ElevatedButton.icon(
                onPressed: busy ? null : () => onDemoLogin(primary),
                icon: const Icon(Icons.dashboard_outlined, size: 18),
                label: Text(
                  app == 'driver'
                      ? 'ورود دمو راننده → داشبورد'
                      : 'ورود دمو خانوار → داشبورد',
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: MineralTheme.primary,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
              ),
            ),
          ],
          if (personas.length > 1) ...[
            const SizedBox(height: 10),
            const Text(
              'سایر نقش‌های دمو',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: MineralTheme.muted),
            ),
          ],
          const SizedBox(height: 8),
          ...personas.where((p) => p.id != primary?.id).map(
            (p) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: OutlinedButton(
                onPressed: busy ? null : () => onDemoLogin(p),
                style: OutlinedButton.styleFrom(
                  alignment: Alignment.centerRight,
                  minimumSize: const Size(0, MineralTheme.buttonHeight),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(p.roleLabel, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                    Text(p.mobile, style: const TextStyle(fontSize: 11, color: MineralTheme.muted)),
                    Text(p.flowHint, style: const TextStyle(fontSize: 10, color: MineralTheme.muted)),
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
