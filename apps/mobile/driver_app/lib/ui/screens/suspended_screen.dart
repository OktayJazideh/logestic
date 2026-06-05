import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';
import 'package:mineral_ui/mineral_ui.dart';

import '../../core/driver_logout.dart';

class SuspendedScreen extends StatelessWidget {
  const SuspendedScreen({
    super.key,
    required this.sessionStore,
  });

  final SessionStore sessionStore;

  @override
  Widget build(BuildContext context) {
    Future<void> logout() => driverLogout(context, sessionStore);

    return Directionality(
      textDirection: TextDirection.rtl,
      child: SimpleScaffold(
        title: 'حساب غیرفعال',
        onLogout: logout,
        status: const SimpleStatusCard(
          message: 'دسترسی شما محدود شده — با پشتیبانی تماس بگیرید.',
          icon: Icons.block_rounded,
          tone: SimpleStatusTone.danger,
        ),
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              Card(
                child: ListTile(
                  leading: const Icon(Icons.phone_in_talk_outlined, color: MineralTheme.primary),
                  title: const Text('پشتیبانی'),
                  subtitle: Text(
                    AppConfig.driverSupportPhone,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      color: MineralTheme.primaryDark,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
