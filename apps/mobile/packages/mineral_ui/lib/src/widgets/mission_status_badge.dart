import 'package:flutter/material.dart';

import '../../mineral_theme.dart';

/// FSM status badge for mission detail / in-transit screens.
class MissionStatusBadge extends StatelessWidget {
  const MissionStatusBadge({super.key, required this.status});

  final String status;

  static String labelFor(String status) {
    switch (status) {
      case 'CREATED':
        return 'ایجاد شده';
      case 'ASSIGNED':
        return 'تخصیص یافته';
      case 'ACCEPTED':
        return 'پذیرش';
      case 'ARRIVED':
        return 'ورود معدن';
      case 'LOADED':
        return 'بارگیری';
      case 'IN_TRANSIT':
        return 'در حال حمل';
      case 'DELIVERED':
        return 'تحویل';
      case 'VERIFIED':
      case 'SETTLED':
        return 'تأیید شده';
      default:
        return status;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: MineralTheme.primaryLight,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: MineralTheme.border),
      ),
      child: Text(
        labelFor(status),
        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: MineralTheme.primary),
      ),
    );
  }
}
