import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

class ErrorBanner extends StatelessWidget {
  const ErrorBanner({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    if (message.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text(
        message,
        style: TextStyle(color: Theme.of(context).colorScheme.error),
      ),
    );
  }
}

String formatApiError(Object e) {
  if (e is ApiException) return e.message;
  return e.toString();
}
