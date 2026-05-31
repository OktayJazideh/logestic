import 'package:flutter/material.dart';

import '../../mineral_theme.dart';

class DriverProfileCard extends StatelessWidget {
  const DriverProfileCard({
    super.key,
    required this.fullName,
    required this.driverCode,
  });

  final String fullName;
  final String driverCode;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: MineralTheme.primaryLight,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: MineralTheme.border),
              ),
              child: const Icon(Icons.person_outline, color: MineralTheme.primary, size: 28),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    fullName,
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: MineralTheme.primaryDark),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    driverCode,
                    style: const TextStyle(fontSize: 13, color: MineralTheme.muted, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
