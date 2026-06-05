import 'package:flutter/material.dart';

import '../../../mineral_theme.dart';

/// Full-width primary CTA — min 56dp (UX-SIMPLE-SPEC-1 §۲.۳).
class BigActionButton extends StatelessWidget {
  const BigActionButton({
    super.key,
    required this.label,
    this.onPressed,
    this.busy = false,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final child = busy
        ? const SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
          )
        : icon != null
            ? Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, size: 22),
                  const SizedBox(width: 8),
                  Text(label),
                ],
              )
            : Text(label);

    return SizedBox(
      width: double.infinity,
      height: MineralTheme.primaryCtaHeight,
      child: FilledButton(
        onPressed: busy ? null : onPressed,
        child: child,
      ),
    );
  }
}
