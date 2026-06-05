import 'package:flutter/material.dart';

import '../../../mineral_theme.dart';

enum SimpleStatusTone { success, warn, danger, info, muted }

/// رنگ معنایی + آیکون + یک خط (UX-SIMPLE-SPEC-1).
class SimpleStatusCard extends StatelessWidget {
  const SimpleStatusCard({
    super.key,
    required this.message,
    required this.icon,
    this.tone = SimpleStatusTone.info,
  });

  final String message;
  final IconData icon;
  final SimpleStatusTone tone;

  Color _accent() {
    switch (tone) {
      case SimpleStatusTone.success:
        return SemanticColors.success;
      case SimpleStatusTone.warn:
        return SemanticColors.warn;
      case SimpleStatusTone.danger:
        return SemanticColors.danger;
      case SimpleStatusTone.info:
        return MineralTheme.primary;
      case SimpleStatusTone.muted:
        return SemanticColors.muted;
    }
  }

  @override
  Widget build(BuildContext context) {
    final accent = _accent();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: accent.withOpacity(0.08),
        borderRadius: BorderRadius.circular(MineralTheme.radiusMd),
        border: Border.all(color: accent.withOpacity(0.25)),
      ),
      child: Row(
        children: [
          Icon(icon, color: accent, size: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                fontFamily: MineralTheme.fontFamily,
                fontSize: MineralTheme.fontSizeBody,
                fontWeight: FontWeight.w600,
                color: MineralTheme.primaryDark,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
