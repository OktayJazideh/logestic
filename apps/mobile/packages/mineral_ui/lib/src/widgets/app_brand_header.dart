import 'package:flutter/material.dart';

import '../../mineral_theme.dart';

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
        Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(
            color: MineralTheme.primaryDark,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: MineralTheme.border),
          ),
          child: Stack(
            alignment: Alignment.center,
            children: [
              Text(
                'ه',
                style: TextStyle(
                  fontFamily: MineralTheme.fontFamily,
                  fontSize: 36,
                  fontWeight: FontWeight.w800,
                  color: Colors.white.withValues(alpha: 0.95),
                ),
              ),
              Positioned(
                right: 10,
                bottom: 10,
                child: Icon(icon, color: MineralTheme.accent.withValues(alpha: 0.9), size: 22),
              ),
            ],
          ),
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
