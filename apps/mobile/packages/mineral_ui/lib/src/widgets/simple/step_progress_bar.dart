import 'package:flutter/material.dart';

import '../../../mineral_theme.dart';
import '../vertical_mission_stepper.dart';

/// «مرحله N از M» + استپر عمودی (وایرفریم ۳).
class StepProgressBar extends StatelessWidget {
  const StepProgressBar({
    super.key,
    required this.currentStepIndex,
    required this.labels,
    this.title,
  });

  /// Active step `0..labels.length-1`.
  final int currentStepIndex;
  final List<String> labels;
  final String? title;

  @override
  Widget build(BuildContext context) {
    final total = labels.length;
    final step = (currentStepIndex.clamp(0, total - 1)) + 1;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (title != null) ...[
          Text(
            title!,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
        ],
        Text(
          'مرحله $step از $total',
          style: const TextStyle(
            fontFamily: MineralTheme.fontFamily,
            fontSize: MineralTheme.fontSizeCaption,
            fontWeight: FontWeight.w700,
            color: MineralTheme.primary,
          ),
        ),
        const SizedBox(height: 12),
        VerticalMissionStepper(
          currentStepIndex: currentStepIndex,
          labels: labels,
        ),
      ],
    );
  }
}
