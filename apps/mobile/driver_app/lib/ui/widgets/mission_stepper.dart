import 'package:flutter/material.dart';

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

  static const _steps = [
    {'status': 'ASSIGNED', 'label': 'شروع سرویس'},
    {'status': 'LOADING', 'label': 'ورود و بارگیری'},
    {'status': 'ON_THE_WAY', 'label': 'حمل به مقصد'},
    {'status': 'UNLOADING', 'label': 'ورود و تخلیه'},
    {'status': 'COMPLETED', 'label': 'بستن سرویس'},
  ];

  int get _currentIndex {
    final idx = _steps.indexWhere((s) => s['status'] == currentStatus);
    return idx < 0 ? 0 : idx;
  }

  @override
  Widget build(BuildContext context) {
    final current = _currentIndex;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),
        for (int i = 0; i < _steps.length; i++) ...[
          _StepRow(
            index: i,
            label: _steps[i]['label'] as String,
            isDone: i < current,
            isActive: i == current,
          ),
          if (i < _steps.length - 1) const Divider(height: 16),
        ],
        const SizedBox(height: 16),
        SizedBox(
          height: 48,
          child: ElevatedButton(
            onPressed: canGoNext ? onNext : null,
            child: Text(currentStatus == 'COMPLETED' ? 'تکمیل شده' : 'ثبت مرحله بعد'),
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

