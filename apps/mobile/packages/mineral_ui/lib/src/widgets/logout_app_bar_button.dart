import 'package:flutter/material.dart';

/// App bar action: clear session and return to login (call [onLogout]).
class LogoutAppBarButton extends StatelessWidget {
  const LogoutAppBarButton({
    super.key,
    required this.onLogout,
  });

  final Future<void> Function() onLogout;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: 'خروج از حساب',
      icon: const Icon(Icons.logout),
      onPressed: () async {
        await onLogout();
      },
    );
  }
}
