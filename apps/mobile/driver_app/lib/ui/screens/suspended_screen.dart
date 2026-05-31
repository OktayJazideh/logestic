import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

class SuspendedScreen extends StatelessWidget {
  const SuspendedScreen({
    super.key,
    required this.sessionStore,
  });

  final SessionStore sessionStore;

  Future<void> _logout(BuildContext context) async {
    await sessionStore.clearSession();
    if (!context.mounted) return;
    Navigator.pushNamedAndRemoveUntil(context, '/login', (_) => false);
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: MineralTheme.bg,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                const Spacer(),
                Container(
                  width: 88,
                  height: 88,
                  decoration: BoxDecoration(
                    color: MineralTheme.danger.withOpacity(0.1),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.block_rounded,
                    size: 48,
                    color: MineralTheme.danger,
                  ),
                ),
                const SizedBox(height: 28),
                Text(
                  'حساب غیرفعال است',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: MineralTheme.primaryDark,
                      ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                Text(
                  'دسترسی شما به‌صورت موقت یا دائم محدود شده است. برای پیگیری با پشتیبانی تماس بگیرید.',
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: MineralTheme.muted,
                        height: 1.6,
                      ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
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
                const Spacer(),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: OutlinedButton(
                    onPressed: () => _logout(context),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: MineralTheme.primary,
                      side: const BorderSide(color: MineralTheme.primary),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    child: const Text('خروج از حساب'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
