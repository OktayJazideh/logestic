import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

import '../../core/driver_api_client.dart';
import '../../core/driver_auth_gate.dart';
import '../../core/otp_validation.dart';

class KycPendingScreen extends StatefulWidget {
  const KycPendingScreen({
    super.key,
    required this.api,
    required this.token,
    required this.sessionStore,
  });

  final DriverApiClient api;
  final String token;
  final SessionStore sessionStore;

  @override
  State<KycPendingScreen> createState() => _KycPendingScreenState();
}

class _KycPendingScreenState extends State<KycPendingScreen> {
  static const _pollInterval = Duration(seconds: 5);

  Timer? _pollTimer;
  bool _checking = false;
  String? _errorText;

  @override
  void initState() {
    super.initState();
    _pollTimer = Timer.periodic(_pollInterval, (_) => _checkStatus(silent: true));
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _checkStatus({bool silent = false}) async {
    if (_checking) return;
    setState(() {
      _checking = true;
      if (!silent) _errorText = null;
    });

    try {
      final me = await widget.api.getDriverMe(token: widget.token);
      if (!mounted) return;

      if (me.isApproved) {
        _pollTimer?.cancel();
        await navigateAfterDriverAuth(
          context: context,
          api: widget.api,
          token: widget.token,
          sessionStore: widget.sessionStore,
        );
        return;
      }

      if (me.isSuspended) {
        _pollTimer?.cancel();
        Navigator.pushNamedAndRemoveUntil(
          context,
          '/suspended',
          (_) => false,
          arguments: widget.token,
        );
        return;
      }
    } catch (e) {
      if (!mounted) return;
      if (!silent) {
        setState(() => _errorText = persianApiError(e));
      }
    } finally {
      if (mounted) setState(() => _checking = false);
    }
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
                    color: MineralTheme.primary.withOpacity(0.12),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.schedule_rounded,
                    size: 48,
                    color: MineralTheme.primary,
                  ),
                ),
                const SizedBox(height: 28),
                Text(
                  'در انتظار تأیید تعاونی',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: MineralTheme.primaryDark,
                      ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                Text(
                  'پروفایل شما برای بررسی به تعاونی ارسال شده است. پس از تأیید می‌توانید مأموریت دریافت کنید.',
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: MineralTheme.muted,
                        height: 1.6,
                      ),
                  textAlign: TextAlign.center,
                ),
                const Spacer(),
                if (_errorText != null) ...[
                  Text(
                    _errorText!,
                    style: const TextStyle(color: MineralTheme.danger),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                ],
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    onPressed: _checking ? null : () => _checkStatus(),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: MineralTheme.primary,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    child: _checking
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                            ),
                          )
                        : const Text('بررسی مجدد'),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'وضعیت هر ۵ ثانیه به‌روز می‌شود',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: MineralTheme.muted),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
