import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

import '../../../core/community_api_client.dart';
import '../../../models/community_models.dart';
import '../../widgets/error_banner.dart';

class MembersScreen extends StatefulWidget {
  const MembersScreen({
    super.key,
    required this.api,
    required this.token,
    required this.onUnauthorized,
  });

  final CommunityApiClient api;
  final String token;
  final VoidCallback onUnauthorized;

  @override
  State<MembersScreen> createState() => _MembersScreenState();
}

class _MembersScreenState extends State<MembersScreen> {
  bool _loading = true;
  String? _error;
  List<CoopMember> _members = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final members = await widget.api.getMembers(token: widget.token);
      if (!mounted) return;
      setState(() => _members = members);
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
    if (_loading) return const Center(child: CircularProgressIndicator());

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'گزارش اعضای تعاونی (شفافیت عضویت)',
            style: TextStyle(color: MineralTheme.muted, fontSize: 13),
          ),
          const SizedBox(height: 12),
          ErrorBanner(message: _error ?? ''),
          Text('تعداد: ${_members.length}', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          ..._members.map(
            (m) => Card(
              child: ListTile(
                title: Text(m.headName),
                subtitle: Text('خانوار #${m.householdId} — روستا ${m.villageId}'),
                trailing: Chip(label: Text(m.status)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
