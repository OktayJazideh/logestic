import 'package:flutter/material.dart';

import '../../mineral_theme.dart';

class TodaySummaryRow extends StatelessWidget {
  const TodaySummaryRow({
    super.key,
    required this.todayTrips,
    required this.todayKm,
    required this.todayDeliveries,
  });

  final int todayTrips;
  final int todayKm;
  final int todayDeliveries;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: _Box(label: 'مأموریت‌ها', value: '$todayTrips')),
        const SizedBox(width: 10),
        Expanded(child: _Box(label: 'کیلومتر', value: todayKm > 0 ? '$todayKm' : '—')),
        const SizedBox(width: 10),
        Expanded(child: _Box(label: 'تحویل', value: '$todayDeliveries')),
      ],
    );
  }
}

class _Box extends StatelessWidget {
  const _Box({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
      decoration: BoxDecoration(
        color: MineralTheme.panel,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: MineralTheme.border),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: MineralTheme.primaryDark),
          ),
          const SizedBox(height: 4),
          Text(label, style: const TextStyle(fontSize: 11, color: MineralTheme.muted, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
