import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

import '../../../core/community_api_client.dart';
import '../../widgets/error_banner.dart';

class ObjectionScreen extends StatefulWidget {
  const ObjectionScreen({
    super.key,
    required this.api,
    required this.token,
    required this.onUnauthorized,
  });

  final CommunityApiClient api;
  final String token;
  final VoidCallback onUnauthorized;

  @override
  State<ObjectionScreen> createState() => _ObjectionScreenState();
}

class _ObjectionScreenState extends State<ObjectionScreen> {
  final _reasonController = TextEditingController();
  final _nameController = TextEditingController();
  final _mobileController = TextEditingController();

  bool _loading = false;
  bool _loadingWallet = true;
  String? _error;
  String? _success;
  int? _householdId;

  @override
  void initState() {
    super.initState();
    _loadHouseholdId();
  }

  @override
  void dispose() {
    _reasonController.dispose();
    _nameController.dispose();
    _mobileController.dispose();
    super.dispose();
  }

  Future<void> _loadHouseholdId() async {
    try {
      final view = await widget.api.getHouseholdWallet(token: widget.token);
      if (!mounted) return;
      setState(() => _householdId = view.wallet.householdId);
    } on ApiException catch (e) {
      if (e.isUnauthorized) {
        widget.onUnauthorized();
        return;
      }
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = formatApiError(e));
    } finally {
      if (mounted) setState(() => _loadingWallet = false);
    }
  }

  Future<void> _submit() async {
    final hid = _householdId;
    if (hid == null) {
      setState(() => _error = 'شناسه خانوار یافت نشد.');
      return;
    }
    final reason = _reasonController.text.trim();
    if (reason.length < 3) {
      setState(() => _error = 'دلیل اعتراض حداقل ۳ کاراکتر باشد.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _success = null;
    });
    try {
      final obj = await widget.api.createObjection(
        token: widget.token,
        householdId: hid,
        reason: reason,
        reporterName: _nameController.text.trim().isEmpty ? null : _nameController.text.trim(),
        reporterMobile:
            _mobileController.text.trim().isEmpty ? null : _mobileController.text.trim(),
      );
      if (!mounted) return;
      setState(() {
        _success = 'اعتراض ثبت شد — کد پیگیری: ${obj.id}';
        _reasonController.clear();
      });
    } on ApiException catch (e) {
      if (e.isUnauthorized) {
        widget.onUnauthorized();
        return;
      }
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = formatApiError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loadingWallet) return const Center(child: CircularProgressIndicator());

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'ثبت اعتراض عضویت — برای خود یا دربارهٔ عضو دیگر (با شناسه خانوار شما).',
          style: TextStyle(color: MineralTheme.muted, fontSize: 13),
        ),
        const SizedBox(height: 12),
        ErrorBanner(message: _error ?? ''),
        if (_success != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(_success!, style: const TextStyle(color: MineralTheme.primary)),
          ),
        TextField(
          controller: _reasonController,
          maxLines: 4,
          decoration: const InputDecoration(labelText: 'دلیل اعتراض *'),
          enabled: !_loading,
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _nameController,
          decoration: const InputDecoration(labelText: 'نام گزارش‌دهنده (اختیاری)'),
          enabled: !_loading,
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _mobileController,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(labelText: 'موبایل گزارش‌دهنده (اختیاری)'),
          enabled: !_loading,
        ),
        const SizedBox(height: 18),
        SizedBox(
          height: 48,
          child: ElevatedButton(
            onPressed: _loading ? null : _submit,
            style: ElevatedButton.styleFrom(
              backgroundColor: MineralTheme.primary,
              foregroundColor: Colors.white,
            ),
            child: _loading
                ? const CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  )
                : const Text('ثبت اعتراض'),
          ),
        ),
      ],
    );
  }
}
