import 'package:flutter/material.dart';

import '../../mineral_theme.dart';
import 'brand_logo_mark.dart';

/// Login / splash brand block — shared look across driver & community apps.
class AppBrandHeader extends StatelessWidget {
  const AppBrandHeader({
    super.key,
    required this.icon,
    required this.subtitle,
    required this.title,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Stack(
          clipBehavior: Clip.none,
          children: [
            const BrandLogoMark(size: 72, borderRadius: 12),
            Positioned(
              right: -4,
              bottom: -4,
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: MineralTheme.panel,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: MineralTheme.border),
                ),
                child: Icon(icon, color: MineralTheme.accent, size: 18),
              ),
            ),
          ],
        ),
        const SizedBox(height: 28),
        Text(
          title,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: MineralTheme.primaryDark,
              ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 6),
        Text(
          subtitle,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: MineralTheme.muted,
                fontWeight: FontWeight.w600,
              ),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}
