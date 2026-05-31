import 'package:flutter/material.dart';

import '../../mineral_theme.dart';

/// Dashboard / home status badge (wireframe 2).
class DriverStatusBadge extends StatelessWidget {
  const DriverStatusBadge({
    super.key,
    required this.dashboardState,
    this.missionStatus,
  });

  /// IDLE | ACTIVE | AWAITING_WB
  final String dashboardState;
  final String? missionStatus;

  static String labelFor(String dashboardState, {String? missionStatus}) {
    switch (dashboardState) {
      case 'AWAITING_WB':
        return 'منتظر باسکول';
      case 'ACTIVE':
        return _missionStatusLabel(missionStatus);
      case 'IDLE':
      default:
        return 'آماده';
    }
  }

  static String _missionStatusLabel(String? status) {
    switch (status) {
      case 'ASSIGNED':
      case 'CREATED':
        return 'تخصیص یافته';
      case 'ACCEPTED':
        return 'پذیرش شده';
      case 'ARRIVED':
        return 'در معدن';
      case 'LOADED':
        return 'بارگیری';
      case 'IN_TRANSIT':
        return 'در حال حمل';
      case 'DELIVERED':
        return 'تحویل شده';
      default:
        return 'مأموریت فعال';
    }
  }

  Color _backgroundColor() {
    switch (dashboardState) {
      case 'AWAITING_WB':
        return MineralTheme.accent.withOpacity(0.15);
      case 'ACTIVE':
        return MineralTheme.primaryLight;
      default:
        return MineralTheme.panelMuted;
    }
  }

  Color _foregroundColor() {
    switch (dashboardState) {
      case 'AWAITING_WB':
        return MineralTheme.accent;
      case 'ACTIVE':
        return MineralTheme.primary;
      default:
        return MineralTheme.muted;
    }
  }

  @override
  Widget build(BuildContext context) {
    final label = labelFor(dashboardState, missionStatus: missionStatus);
    return Align(
      alignment: Alignment.centerRight,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: _backgroundColor(),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: MineralTheme.border),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: _foregroundColor(),
          ),
        ),
      ),
    );
  }
}
