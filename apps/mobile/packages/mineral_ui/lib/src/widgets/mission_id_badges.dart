import 'package:flutter/material.dart';

import '../../format_mission_ids.dart';
import '../../mineral_theme.dart';

/// Wireframe Load ID + Mission code header block.
class MissionIdBadges extends StatelessWidget {
  const MissionIdBadges({
    super.key,
    required this.loadId,
    required this.missionId,
  });

  final int loadId;
  final int missionId;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: MineralTheme.panel,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: MineralTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'شناسه بار (Load ID)',
            style: TextStyle(fontSize: 12, color: MineralTheme.muted),
            textAlign: TextAlign.right,
          ),
          const SizedBox(height: 6),
          Text(
            formatLoadId(loadId),
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: MineralTheme.primaryDark,
                  letterSpacing: 0.5,
                ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            'مأموریت ${formatMissionCode(missionId)}',
            style: TextStyle(fontSize: 13, color: MineralTheme.muted),
            textAlign: TextAlign.right,
          ),
        ],
      ),
    );
  }
}
