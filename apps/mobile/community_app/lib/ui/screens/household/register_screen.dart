import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';
import 'package:mineral_ui/mineral_ui.dart';

import '../../../core/community_api_client.dart';
import '../../../core/community_roles.dart';
import '../../../models/community_models.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({
    super.key,
    required this.api,
    required this.sessionStore,
    required this.token,
    required this.role,
  });

  final CommunityApiClient api;
  final SessionStore sessionStore;
  final String token;
  final String role;

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  static const _stepLabels = ['روستا', 'نام سرپرست', 'کد ملی', 'شماره شبا'];

  final _headNameController = TextEditingController();
  final _nationalIdController = TextEditingController();
  final _ibanController = TextEditingController();

  List<VillageOption> _villages = [];
  int? _villageId;
  int _step = 0;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadVillages();
  }

  @override
  void dispose() {
    _headNameController.dispose();
    _nationalIdController.dispose();
    _ibanController.dispose();
    super.dispose();
  }

  Future<void> _logout() async {
    await widget.sessionStore.clearSession();
    if (!mounted) return;
    Navigator.pushNamedAndRemoveUntil(context, '/login', (_) => false);
  }

  Future<void> _loadVillages() async {
    final mineId = await widget.sessionStore.readMineId();
    if (mineId == null) {
      setState(() => _error = 'ابتدا فضای کاری (معدن) را انتخاب کنید.');
      return;
    }
    setState(() => _loading = true);
    try {
      final villages = await widget.api.getVillages(token: widget.token, mineId: mineId);
      setState(() {
        _villages = villages;
        _villageId = villages.isNotEmpty ? villages.first.id : null;
      });
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  bool _validateStep() {
    setState(() => _error = null);
    switch (_step) {
      case 0:
        if (_villageId == null) {
          setState(() => _error = 'روستا را انتخاب کنید.');
          return false;
        }
        return true;
      case 1:
        if (_headNameController.text.trim().length < 2) {
          setState(() => _error = 'نام سرپرست را وارد کنید.');
          return false;
        }
        return true;
      case 2:
        if (_nationalIdController.text.trim().length < 5) {
          setState(() => _error = 'کد ملی را کامل وارد کنید.');
          return false;
        }
        return true;
      case 3:
        if (_ibanController.text.trim().length < 15) {
          setState(() => _error = 'شماره شبا را کامل وارد کنید.');
          return false;
        }
        return true;
      default:
        return false;
    }
  }

  void _next() {
    if (!_validateStep()) return;
    if (_step < _stepLabels.length - 1) {
      setState(() => _step += 1);
      return;
    }
    _submit();
  }

  void _back() {
    if (_step > 0) setState(() => _step -= 1);
  }

  Future<void> _submit() async {
    if (!_validateStep()) return;

    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.api.registerHousehold(
        token: widget.token,
        villageId: _villageId!,
        nationalId: _nationalIdController.text.trim(),
        bankIban: _ibanController.text.trim(),
        headName: _headNameController.text.trim(),
      );
      if (!mounted) return;
      Navigator.pushReplacementNamed(
        context,
        '/home',
        arguments: {'token': widget.token, 'role': widget.role},
      );
    } catch (e) {
      if (e is ApiException && e.isUnauthorized) {
        await _logout();
        return;
      }
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  Widget _stepField() {
    switch (_step) {
      case 0:
        return DropdownButtonFormField<int>(
          value: _villageId,
          decoration: const InputDecoration(labelText: 'روستا'),
          items: _villages
              .map((v) => DropdownMenuItem(value: v.id, child: Text(v.name)))
              .toList(),
          onChanged: _loading ? null : (v) => setState(() => _villageId = v),
        );
      case 1:
        return TextField(
          controller: _headNameController,
          decoration: const InputDecoration(labelText: 'نام سرپرست'),
          enabled: !_loading,
        );
      case 2:
        return TextField(
          controller: _nationalIdController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'کد ملی',
            helperText: 'پس از ثبت قابل تغییر نیست',
          ),
          enabled: !_loading,
        );
      case 3:
        return TextField(
          controller: _ibanController,
          decoration: const InputDecoration(labelText: 'شماره شبا (IR…)'),
          enabled: !_loading,
        );
      default:
        return const SizedBox.shrink();
    }
  }

  @override
  Widget build(BuildContext context) {
    final isLast = _step == _stepLabels.length - 1;

    return Directionality(
      textDirection: TextDirection.rtl,
      child: SimpleScaffold(
        title: 'ثبت‌نام خانوار',
        onLogout: _logout,
        status: SimpleStatusCard(
          message: 'مرحله ${_step + 1} از ${_stepLabels.length}: ${_stepLabels[_step]}',
          icon: Icons.edit_note_outlined,
          tone: SimpleStatusTone.info,
        ),
        bottomBar: BigActionButton(
          label: isLast ? 'ثبت درخواست' : 'مرحله بعد',
          busy: _loading,
          onPressed: _loading && _villages.isEmpty ? null : _next,
        ),
        secondaryLink: _step > 0
            ? TextButton(onPressed: _loading ? null : _back, child: const Text('مرحله قبل'))
            : null,
        body: _loading && _villages.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'پروفایل ${roleLabelFa(widget.role)} — پس از تأیید تعاونی کیف‌پول فعال می‌شود.',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 16),
                    StepProgressBar(
                      currentStepIndex: _step,
                      labels: _stepLabels,
                    ),
                    const SizedBox(height: 24),
                    _stepField(),
                    if (_error != null) ...[
                      const SizedBox(height: 16),
                      PlainLanguageError(
                        message: _error!,
                        whatToDo: 'اطلاعات این مرحله را اصلاح کنید.',
                      ),
                    ],
                  ],
                ),
              ),
      ),
    );
  }
}
