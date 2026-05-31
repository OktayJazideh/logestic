import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

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
  final _headNameController = TextEditingController();
  final _nationalIdController = TextEditingController();
  final _ibanController = TextEditingController();

  List<VillageOption> _villages = [];
  int? _villageId;
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

  Future<void> _submit() async {
    final headName = _headNameController.text.trim();
    final nationalId = _nationalIdController.text.trim();
    final iban = _ibanController.text.trim();
    if (_villageId == null) {
      setState(() => _error = 'روستا را انتخاب کنید.');
      return;
    }
    if (headName.length < 2 || nationalId.length < 5 || iban.length < 15) {
      setState(() => _error = 'همه فیلدها را کامل وارد کنید.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.api.registerHousehold(
        token: widget.token,
        villageId: _villageId!,
        nationalId: nationalId,
        bankIban: iban,
        headName: headName,
      );
      if (!mounted) return;
      Navigator.pushReplacementNamed(
        context,
        '/home',
        arguments: {'token': widget.token, 'role': widget.role},
      );
    } catch (e) {
      if (e is ApiException && e.isUnauthorized) {
        await widget.sessionStore.clearSession();
        if (!mounted) return;
        Navigator.pushNamedAndRemoveUntil(context, '/login', (_) => false);
        return;
      }
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(title: const Text('ثبت‌نام خانوار')),
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
                    DropdownButtonFormField<int>(
                      value: _villageId,
                      decoration: const InputDecoration(labelText: 'روستا'),
                      items: _villages
                          .map(
                            (v) => DropdownMenuItem(
                              value: v.id,
                              child: Text(v.name),
                            ),
                          )
                          .toList(),
                      onChanged: _loading ? null : (v) => setState(() => _villageId = v),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _headNameController,
                      decoration: const InputDecoration(labelText: 'نام سرپرست'),
                      enabled: !_loading,
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _nationalIdController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'کد ملی',
                        helperText: 'پس از ثبت قابل تغییر نیست',
                      ),
                      enabled: !_loading,
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _ibanController,
                      decoration: const InputDecoration(labelText: 'شماره شبا (IR…)'),
                      enabled: !_loading,
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        _error!,
                        style: TextStyle(color: Theme.of(context).colorScheme.error),
                      ),
                    ],
                    const SizedBox(height: 20),
                    SizedBox(
                      height: 48,
                      child: ElevatedButton(
                        onPressed: _loading ? null : _submit,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: MineralTheme.primary,
                          foregroundColor: Colors.white,
                        ),
                        child: _loading
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Text('ثبت درخواست (PENDING)'),
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}
