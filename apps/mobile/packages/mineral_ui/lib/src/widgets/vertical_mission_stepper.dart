import 'package:flutter/material.dart';

import '../../mineral_theme.dart';

/// Vertical wireframe stepper with completed / active / locked states.
class VerticalMissionStepper extends StatelessWidget {
  const VerticalMissionStepper({
    super.key,
    required this.currentStepIndex,
    required this.labels,
  });

  final int currentStepIndex;
  final List<String> labels;

  @override
  Widget build(BuildContext context) {
    final clamped = currentStepIndex.clamp(0, labels.length - 1);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < labels.length; i++) ...[
          _StepRow(
            label: labels[i],
            state: i < clamped
                ? _StepState.completed
                : (i == clamped ? _StepState.active : _StepState.locked),
            showConnector: i < labels.length - 1,
          ),
        ],
      ],
    );
  }
}

enum _StepState { completed, active, locked }

class _StepRow extends StatelessWidget {
  const _StepRow({
    required this.label,
    required this.state,
    required this.showConnector,
  });

  final String label;
  final _StepState state;
  final bool showConnector;

  @override
  Widget build(BuildContext context) {
    final Widget icon;
    final Color circleBorder;
    final Color circleFill;
    final Color labelColor;
    final FontWeight labelWeight;

    switch (state) {
      case _StepState.completed:
        circleFill = MineralTheme.primary;
        circleBorder = MineralTheme.primary;
        labelColor = MineralTheme.primary;
        labelWeight = FontWeight.w600;
        icon = const Icon(Icons.check, size: 16, color: Colors.white);
      case _StepState.active:
        circleFill = MineralTheme.primaryLight;
        circleBorder = MineralTheme.primary;
        labelColor = MineralTheme.primaryDark;
        labelWeight = FontWeight.w700;
        icon = Icon(Icons.play_arrow, size: 16, color: MineralTheme.primary);
      case _StepState.locked:
        circleFill = MineralTheme.panel;
        circleBorder = MineralTheme.border;
        labelColor = MineralTheme.muted;
        labelWeight = FontWeight.w500;
        icon = Icon(Icons.lock_outline, size: 14, color: MineralTheme.muted);
    }

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 32,
            child: Column(
              children: [
                Container(
                  width: 26,
                  height: 26,
                  decoration: BoxDecoration(
                    color: circleFill,
                    shape: BoxShape.circle,
                    border: Border.all(color: circleBorder, width: state == _StepState.active ? 2 : 1),
                  ),
                  child: Center(child: icon),
                ),
                if (showConnector)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      color: state == _StepState.completed ? MineralTheme.primary : MineralTheme.border,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: showConnector ? 16 : 0, top: 2),
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: labelWeight,
                  color: labelColor,
                  height: 1.3,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
