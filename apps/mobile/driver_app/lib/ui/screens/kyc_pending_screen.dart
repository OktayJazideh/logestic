import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

import 'package:mineral_ui/mineral_ui.dart';

import '../../core/driver_api_client.dart';
import '../../core/driver_auth_gate.dart';
import '../../core/driver_logout.dart';
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

  Future<void> _logout() => driverLogout(context, widget.sessionStore);

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: SimpleScaffold(
        title: 'در انتظار تأیید',
        onLogout: _logout,
        status: const SimpleStatusCard(
          message: 'حساب شما هنوز تأیید نشده — منتظر تعاونی بمانید.',
          icon: Icons.schedule_rounded,
          tone: SimpleStatusTone.warn,
        ),
        bottomBar: BigActionButton(
          label: 'بررسی مجدد',
          busy: _checking,
          onPressed: _checking ? null : () => _checkStatus(),
        ),
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              Text(
                'پروفایل شما برای بررسی به تعاونی ارسال شده است. پس از تأیید می‌توانید مأموریت دریافت کنید.',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: MineralTheme.muted,
                      height: 1.6,
                    ),
                textAlign: TextAlign.center,
              ),
              if (_errorText != null) ...[
                const SizedBox(height: 16),
                PlainLanguageError(
                  message: _errorText!,
                  whatToDo: 'چند لحظه بعد دوباره «بررسی مجدد» را بزنید.',
                ),
              ],
              const Spacer(),
              Text(
                'وضعیت هر ۵ ثانیه به‌روز می‌شود',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: MineralTheme.muted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
