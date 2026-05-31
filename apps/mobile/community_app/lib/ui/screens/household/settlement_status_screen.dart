import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';
import 'package:mineral_ui/format_money.dart';

import '../../../core/community_api_client.dart';
import '../../../models/community_models.dart';
import '../../widgets/error_banner.dart';

class SettlementStatusScreen extends StatefulWidget {
  const SettlementStatusScreen({
    super.key,
    required this.api,
    required this.token,
    required this.onUnauthorized,
  });

  final CommunityApiClient api;
  final String token;
  final VoidCallback onUnauthorized;

  @override
  State<SettlementStatusScreen> createState() => _SettlementStatusScreenState();
}

class _SettlementStatusScreenState extends State<SettlementStatusScreen> {
  bool _loading = true;
  String? _error;
  HouseholdWalletView? _view;
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
      final results = await Future.wait([
        widget.api.getHouseholdWallet(token: widget.token),
        widget.api.getMembers(token: widget.token),
      ]);
      if (!mounted) return;
      setState(() {
        _view = results[0] as HouseholdWalletView;
        _members = results[1] as List<CoopMember>;
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

  CoopMember? _myMember(HouseholdWalletView view) {
    for (final m in _members) {
      if (m.householdId == view.wallet.householdId) return m;
    }
    return _members.isNotEmpty ? _members.first : null;
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    final view = _view;
    final member = view != null ? _myMember(view) : null;
    final poolTxs = view == null
        ? <WalletTransaction>[]
        : view.transactions.where((t) => t.isPoolDistribution).toList();
    poolTxs.sort((a, b) {
      final ad = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      final bd = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      return bd.compareTo(ad);
    });
    final lastPool = poolTxs.isNotEmpty ? poolTxs.first : null;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'وضعیت تسویه و عضویت — تسویه نهایی توسط ادمین عملیات انجام می‌شود؛ '
            'توزیع سهم اجتماعی پس از monthly-close در کیف‌پول منعکس می‌شود.',
            style: TextStyle(color: MineralTheme.muted, fontSize: 13),
          ),
          const SizedBox(height: 12),
          ErrorBanner(message: _error ?? ''),
          if (member != null)
            Card(
              child: ListTile(
                title: const Text('وضعیت عضویت'),
                subtitle: Text(member.headName),
                trailing: Chip(
                  label: Text(member.status),
                  backgroundColor: member.status == 'APPROVED'
                      ? const Color(0xFFE8F5E9)
                      : const Color(0xFFFFFBEB),
                ),
              ),
            ),
          if (view != null)
            Card(
              child: ListTile(
                title: const Text('موجودی فعلی کیف‌پول'),
                trailing: Text(formatMoney(view.balance)),
              ),
            ),
          Card(
            child: ListTile(
              title: const Text('آخرین توزیع استخر اجتماعی'),
              subtitle: lastPool != null
                  ? Text(lastPool.createdAt?.toLocal().toString() ?? '')
                  : const Text('هنوز ثبت نشده'),
              trailing: Text(
                lastPool != null ? formatMoney(lastPool.amount) : '—',
              ),
            ),
          ),
        ],
      ),
    );
  }
}
