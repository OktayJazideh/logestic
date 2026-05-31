import 'package:flutter/material.dart';

/// Horizontal 3-step weighbridge progress: empty → loaded → approved (WF-WB-READ-1).
class WeighbridgeReadStepper extends StatelessWidget {
  const WeighbridgeReadStepper({super.key, required this.ticketStatus});

  final String ticketStatus;

  static const _labels = ['خالی', 'پر', 'تأیید'];

  int get _activeIndex {
    switch (ticketStatus) {
      case 'PENDING_EMPTY':
        return 0;
      case 'EMPTY_REGISTERED':
        return 1;
      case 'LOADED_REGISTERED':
        return 2;
      case 'APPROVED':
        return 3;
      default:
        return 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final active = _activeIndex;

    return Row(
      children: [
        for (var i = 0; i < _labels.length; i++) ...[
          if (i > 0)
            Expanded(
              child: Container(
                height: 3,
                margin: const EdgeInsets.only(bottom: 18),
                color: i < active ? scheme.primary : scheme.outlineVariant.withOpacity(0.35),
              ),
            ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: i < active
                      ? scheme.primary
                      : i == active
                          ? scheme.primaryContainer
                          : scheme.surfaceContainerHigh,
                  border: Border.all(
                    color: i == active ? scheme.primary : scheme.outlineVariant,
                  ),
                ),
                child: Center(
                  child: i < active
                      ? Icon(Icons.check, size: 16, color: scheme.onPrimary)
                      : Text(
                          '${i + 1}',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: i == active ? scheme.onPrimaryContainer : scheme.onSurfaceVariant,
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                _labels[i],
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: i == active || (ticketStatus == 'APPROVED' && i == 2)
                      ? FontWeight.w700
                      : FontWeight.w500,
                  color: i <= active || ticketStatus == 'APPROVED'
                      ? scheme.onSurface
                      : scheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
