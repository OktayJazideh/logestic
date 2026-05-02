import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/session_store.dart';
import '../../theme/mineral_theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    required this.api,
    required this.sessionStore,
  });

  final ApiClient api;
  final SessionStore sessionStore;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _mobileController = TextEditingController();
  final _otpController = TextEditingController();

  bool _otpRequested = false;
  bool _loading = false;
  String? _errorText;

  int? _expiresInSeconds;

  @override
  void dispose() {
    _mobileController.dispose();
    _otpController.dispose();
    super.dispose();
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
      final r = await widget.api.requestOtp(mobile);
      setState(() {
        _otpRequested = true;
        _expiresInSeconds = r.expiresInSeconds;
      });
    } catch (e) {
      setState(() => _errorText = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _verifyOtp() async {
    final mobile = _mobileController.text.trim();
    final otp = _otpController.text.trim();
    if (otp.length != 6) {
      setState(() => _errorText = 'کد OTP باید ۶ رقم باشد.');
      return;
    }

    setState(() {
      _loading = true;
      _errorText = null;
    });

    try {
      final v = await widget.api.verifyOtp(mobileNumber: mobile, otpCode: otp);
      if (v.role != 'DRIVER') {
        setState(() => _errorText = 'این اپ مخصوص راننده است.');
        return;
      }
      await widget.sessionStore.saveSession(
        AuthSession(accessToken: v.accessToken, role: v.role, mobileNumber: mobile),
      );
      // Next: select mine context.
      if (!mounted) return;
      Navigator.pushReplacementNamed(context, '/mine-select', arguments: v.accessToken);
    } catch (e) {
      setState(() => _errorText = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('ورود راننده'),
        ),
        body: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'احراز هویت با شماره موبایل (OTP)',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _mobileController,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(labelText: 'شماره موبایل'),
                    enabled: !_loading,
                  ),
                  const SizedBox(height: 12),
                  if (_otpRequested)
                    TextField(
                      controller: _otpController,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        labelText: 'کد OTP',
                        helperText: _expiresInSeconds != null ? 'تا $_expiresInSeconds ثانیه' : null,
                      ),
                      enabled: !_loading,
                    ),
                  if (_errorText != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      _errorText!,
                      style: TextStyle(color: Theme.of(context).colorScheme.error),
                    ),
                  ],
                  const SizedBox(height: 18),
                  SizedBox(
                    height: 48,
                    child: ElevatedButton(
                      onPressed: _loading ? null : (_otpRequested ? _verifyOtp : _requestOtp),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: MineralTheme.primary,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      child: _loading
                          ? const CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation<Color>(Colors.white))
                          : Text(_otpRequested ? 'تایید کد' : 'ارسال کد'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

