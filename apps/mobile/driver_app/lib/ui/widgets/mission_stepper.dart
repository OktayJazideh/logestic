import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

/// Horizontal 7-step wireframe stepper (WF-STEPPER-1).
class MissionStepper extends StatelessWidget {
  const MissionStepper({
    super.key,
    required this.currentStepIndex,
    required this.labels,
  });

  /// Active step `0..labels.length-1` (completed steps are `< currentStepIndex`).
  final int currentStepIndex;
  final List<String> labels;

  @override
  Widget build(BuildContext context) {
    final clampedIndex = currentStepIndex.clamp(0, labels.length - 1);

    return LayoutBuilder(
      builder: (context, constraints) {
        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: ConstrainedBox(
            constraints: BoxConstraints(minWidth: constraints.maxWidth),
            child: Row(
              children: [
                for (int i = 0; i < labels.length; i++) ...[
                  if (i > 0) _Connector(isCompleted: i <= clampedIndex),
                  _StepNode(
                    index: i,
                    label: labels[i],
                    state: i < clampedIndex
                        ? _StepVisualState.completed
                        : (i == clampedIndex
                            ? _StepVisualState.active
                            : _StepVisualState.upcoming),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

enum _StepVisualState { completed, active, upcoming }

class _StepNode extends StatelessWidget {
  const _StepNode({
    required this.index,
    required this.label,
    required this.state,
  });

  final int index;
  final String label;
  final _StepVisualState state;

  @override
  Widget build(BuildContext context) {
    final Color circleColor;
    final Color borderColor;
    final Color labelColor;
    final Widget circleChild;

    switch (state) {
      case _StepVisualState.completed:
        circleColor = MineralTheme.primary;
        borderColor = MineralTheme.primary;
        labelColor = MineralTheme.primary;
        circleChild = const Icon(Icons.check, size: 14, color: Colors.white);
      case _StepVisualState.active:
        circleColor = MineralTheme.primary.withOpacity(0.12);
        borderColor = MineralTheme.primary;
        labelColor = MineralTheme.primaryDark;
        circleChild = Text(
          '${index + 1}',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: MineralTheme.primary,
          ),
        );
      case _StepVisualState.upcoming:
        circleColor = Colors.white;
        borderColor = MineralTheme.border;
        labelColor = MineralTheme.muted;
        circleChild = Text(
          '${index + 1}',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: MineralTheme.muted,
          ),
        );
    }

    return SizedBox(
      width: 72,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 26,
            height: 26,
            decoration: BoxDecoration(
              color: circleColor,
              shape: BoxShape.circle,
              border: Border.all(color: borderColor, width: state == _StepVisualState.active ? 2 : 1),
            ),
            child: Center(child: circleChild),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 10,
              height: 1.2,
              fontWeight: state == _StepVisualState.active ? FontWeight.w700 : FontWeight.w500,
              color: labelColor,
            ),
          ),
        ],
      ),
    );
  }
}

class _Connector extends StatelessWidget {
  const _Connector({required this.isCompleted});

  final bool isCompleted;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        height: 2,
        margin: const EdgeInsets.only(bottom: 22, left: 2, right: 2),
        color: isCompleted ? MineralTheme.primary : MineralTheme.border,
      ),
    );
  }
}
