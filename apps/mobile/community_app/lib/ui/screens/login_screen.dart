import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mineral_api/mineral_api.dart';
import 'package:mineral_ui/mineral_ui.dart';

import '../../core/community_api_client.dart';
import '../../core/community_roles.dart';
import '../../core/operator_gate.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    required this.api,
    required this.sessionStore,
  });

  final CommunityApiClient api;
  final SessionStore sessionStore;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  static const _resendSeconds = 60;

  final _mobileController = TextEditingController();
  final _otpKey = GlobalKey<OtpPinInputState>();

  bool _otpRequested = false;
  bool _loading = false;
  String? _errorText;
  String _otpValue = '';
  int _resendCountdown = 0;
  Timer? _resendTimer;

  @override
  void dispose() {
    _mobileController.dispose();
    _resendTimer?.cancel();
    super.dispose();
  }

  void _startResendCountdown([int seconds = _resendSeconds]) {
    _resendTimer?.cancel();
    setState(() => _resendCountdown = seconds);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      if (_resendCountdown <= 1) {
        t.cancel();
        setState(() => _resendCountdown = 0);
      } else {
        setState(() => _resendCountdown -= 1);
      }
    });
  }

  Future<void> _requestOtp() async {
    final mobile = _mobileController.text.trim();
    if (mobile.length < 9) {
      setState(() => _errorText = 'شماره موبایل معتبر وارد کنید.');
      return;
    }
    setState(() {
      _loading = true;
      _errorText = null;
    });
    try {
      await widget.api.requestOtp(mobile);
      setState(() {
        _otpRequested = true;
        _otpValue = '';
      });
      _otpKey.currentState?.clear();
      _startResendCountdown();
    } catch (e) {
      setState(() => _errorText = authErrorMessage(e));
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _resendOtp() async {
    if (_resendCountdown > 0 || _loading) return;
    await _requestOtp();
  }

  Future<void> _verifyOtp() async {
    final mobile = _mobileController.text.trim();
    if (_otpValue.length != 6) {
      setState(() => _errorText = 'کد OTP باید ۶ رقم باشد.');
      return;
    }
    setState(() {
      _loading = true;
      _errorText = null;
    });
    try {
      final v = await widget.api.verifyOtp(mobileNumber: mobile, otpCode: _otpValue);
      if (!isCommunityRole(v.role)) {
        setState(() => _errorText = 'این اپ مخصوص خانوار، تعاونی و اپراتور ساعتی است.');
        return;
      }
      await widget.sessionStore.saveSession(
        AuthSession(accessToken: v.accessToken, role: v.role, mobileNumber: mobile),
      );
      if (!mounted) return;
      Navigator.pushReplacementNamed(
        context,
        '/workspace-select',
        arguments: {
          'token': v.accessToken,
          'role': normalizeCommunityRole(v.role),
        },
      );
    } catch (e) {
      setState(() => _errorText = authErrorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _backToMobile() {
    _resendTimer?.cancel();
    setState(() {
      _otpRequested = false;
      _otpValue = '';
      _errorText = null;
      _resendCountdown = 0;
    });
  }

  Future<void> _demoLogin(DemoPersona persona) async {
    setState(() {
      _loading = true;
      _errorText = null;
    });
    try {
      final result = await performDemoLogin(
        api: widget.api,
        persona: persona,
        sessionStore: widget.sessionStore,
      );
      if (!isCommunityRole(result.role)) {
        setState(() => _errorText = 'این اپ مخصوص نقش‌های تعاونی است (${result.role}).');
        return;
      }
      if (!mounted) return;
      if (result.workspaceSelected) {
        await navigateAfterWorkspace(
          context: context,
          api: widget.api,
          token: result.accessToken,
          role: normalizeCommunityRole(result.role),
        );
        return;
      }
      Navigator.pushReplacementNamed(
        context,
        '/workspace-select',
        arguments: {
          'token': result.accessToken,
          'role': normalizeCommunityRole(result.role),
        },
      );
    } catch (e) {
      setState(() => _errorText = authErrorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: MineralTheme.bg,
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 24),
                    AppBrandHeader(
                      icon: Icons.groups_outlined,
                      title: BrandNames.communityLoginTitle,
                      subtitle: BrandNames.communityLoginSubtitle,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _otpRequested
                          ? 'کد ارسال‌شده به ${_mobileController.text.trim()} را وارد کنید'
                          : 'شماره موبایل خود را وارد کنید',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(color: MineralTheme.muted),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 32),
                    if (!_otpRequested) ...[
                      TextField(
                        controller: _mobileController,
                        keyboardType: TextInputType.phone,
                        enabled: !_loading,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                          LengthLimitingTextInputFormatter(11),
                        ],
                        decoration: const InputDecoration(
                          labelText: 'شماره موبایل',
                          hintText: '۰۹۱۲۳۴۵۶۷۸۹',
                          prefixIcon: Icon(Icons.phone_android_outlined),
                        ),
                      ),
                    ] else ...[
                      OtpPinInput(
                        key: _otpKey,
                        enabled: !_loading,
                        onChanged: (v) => setState(() => _otpValue = v),
                      ),
                      const SizedBox(height: 16),
                      if (_resendCountdown > 0)
                        Text(
                          'ارسال مجدد کد تا $_resendCountdown ثانیه',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(color: MineralTheme.muted),
                          textAlign: TextAlign.center,
                        )
                      else
                        TextButton(
                          onPressed: _loading ? null : _resendOtp,
                          child: const Text('ارسال مجدد کد'),
                        ),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: _loading ? null : _backToMobile,
                        child: const Text('تغییر شماره موبایل'),
                      ),
                    ],
                    if (_errorText != null) ...[
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: MineralTheme.danger.withOpacity(0.08),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: MineralTheme.danger.withOpacity(0.3)),
                        ),
                        child: Text(
                          _errorText!,
                          style: const TextStyle(color: MineralTheme.danger),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                    SizedBox(
                      height: 48,
                      child: ElevatedButton(
                        onPressed: _loading ? null : (_otpRequested ? _verifyOtp : _requestOtp),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: MineralTheme.primary,
                          foregroundColor: Colors.white,
                          disabledBackgroundColor: MineralTheme.primary.withOpacity(0.5),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        child: _loading
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                                ),
                              )
                            : Text(_otpRequested ? 'ورود' : 'دریافت کد'),
                      ),
                    ),
                    DemoLoginPanel(
                      app: 'community',
                      busy: _loading,
                      onDemoLogin: _demoLogin,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
