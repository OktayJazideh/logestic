import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

import '../../../core/community_api_client.dart';
import '../../../models/community_models.dart';
import '../../widgets/error_banner.dart';

class ObjectionsReviewScreen extends StatefulWidget {
  const ObjectionsReviewScreen({
    super.key,
    required this.api,
    required this.token,
    required this.onUnauthorized,
  });

  final CommunityApiClient api;
  final String token;
  final VoidCallback onUnauthorized;

  @override
  State<ObjectionsReviewScreen> createState() => _ObjectionsReviewScreenState();
}

class _ObjectionsReviewScreenState extends State<ObjectionsReviewScreen> {
  bool _loading = true;
  String? _error;
  List<MembershipObjection> _objections = [];
  final Map<int, TextEditingController> _reasonControllers = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in _reasonControllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  TextEditingController _reasonFor(int id) {
    return _reasonControllers.putIfAbsent(id, TextEditingController.new);
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await widget.api.getObjections(token: widget.token);
      if (!mounted) return;
      setState(() => _objections = list);
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

  Future<void> _resolve(MembershipObjection obj, String status) async {
    final reason = _reasonFor(obj.id).text.trim();
    if (reason.length < 3) {
      setState(() => _error = 'دلیل بررسی حداقل ۳ کاراکتر باشد.');
      return;
    }
    try {
      await widget.api.resolveObjection(
        token: widget.token,
        objectionId: obj.id,
        status: status,
        reason: reason,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('اعتراض #${obj.id} به $status تغییر کرد')),
      );
      await _load();
    } on ApiException catch (e) {
      if (e.isUnauthorized) {
        widget.onUnauthorized();
        return;
      }
      setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    final open = _objections.where((o) => o.status == 'OPEN').toList();

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'بررسی اعتراض‌های عضویت — معتبر (RESOLVED) یا رد (REJECTED)',
            style: TextStyle(color: MineralTheme.muted, fontSize: 13),
          ),
          const SizedBox(height: 12),
          ErrorBanner(message: _error ?? ''),
          if (open.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Text('اعتراض باز برای بررسی وجود ندارد.'),
              ),
            )
          else
            ...open.map(
              (o) => Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('#${o.id} — خانوار ${o.householdId}',
                          style: Theme.of(context).textTheme.titleSmall),
                      Text('گزارش‌دهنده: ${o.reporterName}'),
                      Text('دلیل: ${o.reason}'),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _reasonFor(o.id),
                        decoration: const InputDecoration(labelText: 'دلیل تصمیم *'),
                        maxLines: 2,
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => _resolve(o, 'REJECTED'),
                              child: const Text('رد اعتراض'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: ElevatedButton(
                              onPressed: () => _resolve(o, 'RESOLVED'),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: MineralTheme.primary,
                                foregroundColor: Colors.white,
                              ),
                              child: const Text('معتبر'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          if (_objections.any((o) => o.status != 'OPEN')) ...[
            const SizedBox(height: 16),
            Text('سوابق', style: Theme.of(context).textTheme.titleSmall),
            ..._objections.where((o) => o.status != 'OPEN').map(
                  (o) => ListTile(
                    dense: true,
                    title: Text('#${o.id} — ${o.status}'),
                    subtitle: Text(o.reason),
                  ),
                ),
          ],
        ],
      ),
    );
  }
}
