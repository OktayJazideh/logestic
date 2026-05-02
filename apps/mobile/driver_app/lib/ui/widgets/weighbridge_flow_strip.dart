import 'package:flutter/material.dart';

/// Weighbridge lifecycle for driver visibility — aligned with backend `WeighbridgeTicketStatus`.
class WeighbridgeFlowStrip extends StatelessWidget {
  const WeighbridgeFlowStrip({
    super.key,
    required this.ticketStatus,
    this.ticketPending = false,
    this.compact = false,
  });

  final String? ticketStatus;
  final bool ticketPending;
  final bool compact;

  static const _steps = <_WbStep>[
    _WbStep(title: 'تیکت باسکول', subtitle: 'پس از اتمام کار راننده'),
    _WbStep(title: 'ثبت وزن', subtitle: 'اپراتور باسکول'),
    _WbStep(title: 'تأیید ناظر', subtitle: 'پذیرش یا رد'),
    _WbStep(title: 'سهم مالی', subtitle: 'پس از تأیید معتبر'),
  ];

  List<_Dot> _dots() {
    if (ticketPending && ticketStatus == null) {
      return const [_Dot.current, _Dot.pending, _Dot.pending, _Dot.pending];
    }
    final s = ticketStatus;
    if (s == null) {
      return const [_Dot.pending, _Dot.pending, _Dot.pending, _Dot.pending];
    }
    switch (s) {
      case 'PENDING_EMPTY':
      case 'EMPTY_REGISTERED':
        return const [_Dot.done, _Dot.current, _Dot.pending, _Dot.pending];
      case 'LOADED_REGISTERED':
        return const [_Dot.done, _Dot.done, _Dot.current, _Dot.pending];
      case 'APPROVED':
      case 'ADJUSTED':
        return const [_Dot.done, _Dot.done, _Dot.done, _Dot.done];
      case 'REJECTED':
        return const [_Dot.done, _Dot.done, _Dot.error, _Dot.pending];
      default:
        return const [_Dot.pending, _Dot.pending, _Dot.pending, _Dot.pending];
    }
  }

  @override
  Widget build(BuildContext context) {
    final dots = _dots();
    final scheme = Theme.of(context).colorScheme;

    if (compact) {
      return Row(
        children: [
          for (var i = 0; i < 4; i++) ...[
            Expanded(
              child: _CompactSegment(dot: dots[i], scheme: scheme),
            ),
            if (i < 3) const SizedBox(width: 4),
          ],
        ],
      );
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withOpacity(0.35),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.outlineVariant.withOpacity(0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'زنجیره باسکول (حمل تنی)',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          if (ticketPending && ticketStatus == null) ...[
            const SizedBox(height: 8),
            Text(
              'تیکت باسکول در حال ایجاد است؛ لطفاً چند ثانیه بعد بروزرسانی کنید.',
              style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
            ),
          ],
          const SizedBox(height: 10),
          for (var i = 0; i < _steps.length; i++) ...[
            _StepLine(step: _steps[i], dot: dots[i], stepNumber: i + 1),
            if (i < _steps.length - 1) const SizedBox(height: 6),
          ],
        ],
      ),
    );
  }
}

enum _Dot { pending, current, done, error }

class _CompactSegment extends StatelessWidget {
  const _CompactSegment({required this.dot, required this.scheme});

  final _Dot dot;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    Color c;
    switch (dot) {
      case _Dot.done:
        c = scheme.primary;
        break;
      case _Dot.current:
        c = scheme.primaryContainer;
        break;
      case _Dot.error:
        c = scheme.error;
        break;
      case _Dot.pending:
        c = scheme.outlineVariant.withOpacity(0.4);
        break;
    }
    return Container(
      height: 4,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: c,
      ),
    );
  }
}

class _WbStep {
  const _WbStep({required this.title, required this.subtitle});

  final String title;
  final String subtitle;
}

class _StepLine extends StatelessWidget {
  const _StepLine({
    required this.step,
    required this.dot,
    required this.stepNumber,
  });

  final _WbStep step;
  final _Dot dot;
  final int stepNumber;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    Color fg;
    switch (dot) {
      case _Dot.done:
        fg = scheme.primary;
        break;
      case _Dot.current:
        fg = scheme.onPrimaryContainer;
        break;
      case _Dot.error:
        fg = scheme.error;
        break;
      case _Dot.pending:
        fg = scheme.onSurfaceVariant;
        break;
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 26,
          child: Center(
            child: Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: dot == _Dot.done
                    ? scheme.primary
                    : dot == _Dot.current
                        ? scheme.primaryContainer
                        : dot == _Dot.error
                            ? scheme.errorContainer
                            : scheme.surfaceContainerHigh,
                border: Border.all(
                  color: dot == _Dot.error ? scheme.error : scheme.outlineVariant,
                ),
              ),
              child: Center(
                child: dot == _Dot.done
                    ? Icon(Icons.check, size: 14, color: scheme.onPrimary)
                    : dot == _Dot.error
                        ? Icon(Icons.close, size: 14, color: scheme.error)
                        : Text(
                            '$stepNumber',
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: fg),
                          ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                step.title,
                style: TextStyle(
                  fontWeight: dot == _Dot.current || dot == _Dot.error ? FontWeight.w700 : FontWeight.w600,
                  fontSize: 13,
                  color: dot == _Dot.error ? scheme.error : Colors.black87,
                ),
              ),
              Text(
                step.subtitle,
                style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
