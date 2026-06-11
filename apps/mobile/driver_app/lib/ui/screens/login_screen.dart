import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mineral_api/mineral_api.dart';

import 'package:mineral_ui/mineral_ui.dart';

import '../../core/driver_api_client.dart';
import '../../core/driver_auth_gate.dart';
import '../../core/otp_validation.dart';

enum _LoginMode { mobile, otp, password }

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    required this.api,
    required this.sessionStore,
  });

  final DriverApiClient api;
  final SessionStore sessionStore;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  static const _resendSeconds = 60;

  final _mobileController = TextEditingController();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _otpKey = GlobalKey<OtpPinInputState>();

  _LoginMode _mode = _LoginMode.mobile;
  bool _loading = false;
  String? _errorText;
  String _otpValue = '';
  int _resendCountdown = 0;
  Timer? _resendTimer;

  @override
  void dispose() {
    _mobileController.dispose();
    _usernameController.dispose();
    _passwordController.dispose();
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
    final mobileErr = validateMobile(_mobileController.text);
    if (mobileErr != null) {
      setState(() => _errorText = mobileErr);
      return;
    }

    final mobile = normalizeMobile(_mobileController.text);
    setState(() {
      _loading = true;
      _errorText = null;
    });

    try {
      await widget.api.requestOtp(mobile);
      setState(() {
        _mode = _LoginMode.otp;
        _otpValue = '';
      });
      _otpKey.currentState?.clear();
      _startResendCountdown();
    } catch (e) {
      setState(() => _errorText = persianApiError(e));
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _resendOtp() async {
    if (_resendCountdown > 0 || _loading) return;
    await _requestOtp();
  }

  Future<void> _completeAuth(AuthVerifyResponse v, {String? mobileNumber}) async {
    if (v.role != 'DRIVER') {
      setState(() => _errorText = 'این اپ مخصوص راننده است.');
      return;
    }
    await widget.sessionStore.saveSession(
      AuthSession(accessToken: v.accessToken, role: v.role, mobileNumber: mobileNumber),
    );
    if (!mounted) return;
    await navigateAfterDriverAuth(
      context: context,
      api: widget.api,
      token: v.accessToken,
      sessionStore: widget.sessionStore,
    );
  }

  Future<void> _verifyOtp() async {
    final mobileErr = validateMobile(_mobileController.text);
    if (mobileErr != null) {
      setState(() => _errorText = mobileErr);
      return;
    }

    final otpErr = validateOtp(_otpValue);
    if (otpErr != null) {
      setState(() => _errorText = otpErr);
      return;
    }

    final mobile = normalizeMobile(_mobileController.text);
    setState(() {
      _loading = true;
      _errorText = null;
    });

    try {
      final v = await widget.api.verifyOtp(mobileNumber: mobile, otpCode: _otpValue);
      await _completeAuth(v, mobileNumber: mobile);
    } catch (e) {
      setState(() => _errorText = persianApiError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loginWithPassword() async {
    final username = _usernameController.text.trim();
    final password = _passwordController.text;
    if (username.isEmpty || password.length < 6) {
      setState(() => _errorText = 'نام کاربری و رمز عبور (حداقل ۶ کاراکتر) را وارد کنید.');
      return;
    }
    setState(() {
      _loading = true;
      _errorText = null;
    });
    try {
      final v = await widget.api.loginWithPassword(username: username, password: password);
      await _completeAuth(v);
    } catch (e) {
      setState(() => _errorText = persianApiError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _backToMobile() {
    _resendTimer?.cancel();
    setState(() {
      _mode = _LoginMode.mobile;
      _otpValue = '';
      _errorText = null;
      _resendCountdown = 0;
    });
  }

  void _openPasswordMode() {
    setState(() {
      _mode = _LoginMode.password;
      _errorText = null;
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
      if (result.role != 'DRIVER') {
        setState(() => _errorText = 'این اپ مخصوص راننده است (${result.role}).');
        return;
      }
      if (!mounted) return;
      await navigateAfterDriverAuth(
        context: context,
        api: widget.api,
        token: result.accessToken,
        sessionStore: widget.sessionStore,
      );
    } catch (e) {
      setState(() => _errorText = persianApiError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String get _subtitle {
    switch (_mode) {
      case _LoginMode.mobile:
        return 'شماره موبایل خود را وارد کنید';
      case _LoginMode.otp:
        return 'کد ارسال‌شده به ${_mobileController.text.trim()} را وارد کنید';
      case _LoginMode.password:
        return 'نام کاربری و رمز عبور خود را وارد کنید';
    }
  }

  String get _primaryLabel {
    switch (_mode) {
      case _LoginMode.mobile:
        return 'دریافت ${simpleLabel('otp')}';
      case _LoginMode.otp:
        return 'ورود';
      case _LoginMode.password:
        return 'ورود';
    }
  }

  VoidCallback? get _primaryAction {
    if (_loading) return null;
    switch (_mode) {
      case _LoginMode.mobile:
        return _requestOtp;
      case _LoginMode.otp:
        return _verifyOtp;
      case _LoginMode.password:
        return _loginWithPassword;
    }
  }

  @override
  Widget build(BuildContext context) {
    return ExitAppOnBackScope(
      child: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          backgroundColor: MineralTheme.bg,
          bottomNavigationBar: SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 12),
              child: BigActionButton(
                label: _primaryLabel,
                busy: _loading,
                onPressed: _primaryAction,
              ),
            ),
          ),
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
                        icon: Icons.local_shipping_outlined,
                        title: BrandNames.driverLoginTitle,
                        subtitle: BrandNames.driverLoginSubtitle,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _subtitle,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(color: MineralTheme.muted),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 32),
                      if (_mode == _LoginMode.mobile) ...[
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
                        const SizedBox(height: 12),
                        TextButton(
                          onPressed: _loading ? null : _openPasswordMode,
                          child: const Text('ورود با نام کاربری و رمز'),
                        ),
                      ] else if (_mode == _LoginMode.otp) ...[
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
                      ] else ...[
                        TextField(
                          controller: _usernameController,
                          enabled: !_loading,
                          decoration: const InputDecoration(
                            labelText: 'نام کاربری',
                            prefixIcon: Icon(Icons.person_outline),
                          ),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _passwordController,
                          enabled: !_loading,
                          obscureText: true,
                          decoration: const InputDecoration(
                            labelText: 'رمز عبور',
                            prefixIcon: Icon(Icons.lock_outline),
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextButton(
                          onPressed: _loading ? null : _backToMobile,
                          child: const Text('بازگشت به ورود با پیامک'),
                        ),
                      ],
                      if (_errorText != null) ...[
                        const SizedBox(height: 16),
                        PlainLanguageError(
                          message: _errorText!,
                          whatToDo: 'اطلاعات را بررسی کنید و دوباره تلاش کنید.',
                        ),
                      ],
                      const SizedBox(height: 80),
                      if (_mode == _LoginMode.mobile)
                        DemoLoginPanel(
                          app: 'driver',
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
      ),
    );
  }
}
