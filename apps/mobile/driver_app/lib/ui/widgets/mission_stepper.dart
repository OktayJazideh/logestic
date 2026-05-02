import 'package:flutter/material.dart';

import '../../core/mission_flow.dart';

/// Stepper UI aligned with backend mission state machine (strictly forward steps).
class MissionStepper extends StatelessWidget {
  const MissionStepper({
    super.key,
    required this.currentStatus,
    required this.onNext,
    required this.canGoNext,
  });

  final String currentStatus;
  final VoidCallback onNext;
  final bool canGoNext;

  int get _currentIndex {
    final idx = MissionFlow.driverStepOrder.indexOf(currentStatus);
    return idx < 0 ? 0 : idx;
  }

  @override
  Widget build(BuildContext context) {
    final current = _currentIndex;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),
        for (int i = 0; i < MissionFlow.driverStepOrder.length; i++) ...[
          _StepRow(
            index: i,
            label: MissionFlow.labelFa(MissionFlow.driverStepOrder[i]),
            isDone: i < current,
            isActive: i == current,
          ),
          if (i < MissionFlow.driverStepOrder.length - 1) const Divider(height: 16),
        ],
        const SizedBox(height: 16),
        SizedBox(
          height: 48,
          child: ElevatedButton(
            onPressed: canGoNext ? onNext : null,
            child: Text(MissionFlow.primaryActionLabel(currentStatus)),
          ),
        ),
      ],
    );
  }
}

class _StepRow extends StatelessWidget {
  const _StepRow({
    required this.index,
    required this.label,
    required this.isDone,
    required this.isActive,
  });

  final int index;
  final String label;
  final bool isDone;
  final bool isActive;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final circleColor = isDone
        ? colorScheme.primary
        : (isActive ? colorScheme.primaryContainer : Colors.white);
    final borderColor = isActive ? colorScheme.primary : Colors.grey.shade300;

    return Row(
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            color: circleColor,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: borderColor),
          ),
          child: Center(
            child: Text(
              isDone ? '✓' : '${index + 1}',
              style: TextStyle(
                fontSize: 12,
                color: isDone ? Colors.white : Colors.black87,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            label,
            style: TextStyle(
              fontWeight: isActive ? FontWeight.bold : FontWeight.w500,
              color: Colors.black87,
            ),
          ),
        ),
      ],
    );
  }
}
