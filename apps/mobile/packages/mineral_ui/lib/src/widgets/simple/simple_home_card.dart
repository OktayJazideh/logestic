import 'package:flutter/material.dart';

import '../../../mineral_theme.dart';

/// کارت بزرگ خانه — آیکون + عنوان + زیرنویس (UX-MOBILE-SIMPLE-1 community).
class SimpleHomeCard extends StatelessWidget {
  const SimpleHomeCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(MineralTheme.radiusLg),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: MineralTheme.primaryLight,
                  borderRadius: BorderRadius.circular(MineralTheme.radiusMd),
                ),
                child: Icon(icon, color: MineralTheme.primary, size: 28),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontFamily: MineralTheme.fontFamily,
                        fontSize: MineralTheme.fontSizeBody,
                        fontWeight: FontWeight.w700,
                        color: MineralTheme.primaryDark,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontFamily: MineralTheme.fontFamily,
                        fontSize: MineralTheme.fontSizeCaption,
                        color: MineralTheme.muted,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_left, color: MineralTheme.muted),
            ],
          ),
        ),
      ),
    );
  }
}
