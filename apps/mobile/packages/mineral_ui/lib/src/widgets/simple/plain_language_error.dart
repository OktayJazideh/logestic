import 'package:flutter/material.dart';

import '../../../mineral_theme.dart';

/// خطای فارسی + «چکار کنم؟» + اقدام اختیاری (UX-SIMPLE-SPEC-1 §۲.۴).
class PlainLanguageError extends StatelessWidget {
  const PlainLanguageError({
    super.key,
    required this.message,
    this.whatToDo,
    this.onRetry,
    this.retryLabel = 'تلاش مجدد',
  });

  final String message;
  final String? whatToDo;
  final VoidCallback? onRetry;
  final String retryLabel;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: SemanticColors.danger.withOpacity(0.08),
        borderRadius: BorderRadius.circular(MineralTheme.radiusMd),
        border: Border.all(color: SemanticColors.danger.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontFamily: MineralTheme.fontFamily,
              color: SemanticColors.danger,
              fontSize: MineralTheme.fontSizeBody,
              fontWeight: FontWeight.w600,
              height: 1.4,
            ),
          ),
          if (whatToDo != null && whatToDo!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              'چکار کنم؟ $whatToDo',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontFamily: MineralTheme.fontFamily,
                color: MineralTheme.muted,
                fontSize: MineralTheme.fontSizeCaption,
                height: 1.4,
              ),
            ),
          ],
          if (onRetry != null) ...[
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.center,
              child: TextButton(onPressed: onRetry, child: Text(retryLabel)),
            ),
          ],
        ],
      ),
    );
  }
}
