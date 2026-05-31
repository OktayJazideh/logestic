import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';
import 'package:mineral_ui/format_money.dart';

import '../../../core/community_api_client.dart';
import '../../../models/community_models.dart';
import '../../widgets/error_banner.dart';

class WalletScreen extends StatefulWidget {
  const WalletScreen({
    super.key,
    required this.api,
    required this.token,
    required this.onUnauthorized,
  });

  final CommunityApiClient api;
  final String token;
  final VoidCallback onUnauthorized;

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  bool _loading = true;
  String? _error;
  HouseholdWalletView? _view;

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
      final view = await widget.api.getHouseholdWallet(token: widget.token);
      if (!mounted) return;
      setState(() => _view = view);
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
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    final view = _view;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'کیف‌پول خانوار — واریزهای POOL_DISTRIBUTION بر اساس سهم ثابت به ازای تن تأییدشده '
            '(مستقل از کرایه عملیاتی)',
            style: TextStyle(color: MineralTheme.muted, fontSize: 13),
          ),
          if (view?.communityRialPerTon != null) ...[
            const SizedBox(height: 6),
            Text(
              'نرخ جاری: ${formatMoney(view!.communityRialPerTon!)} به ازای هر تن تأییدشده',
              style: const TextStyle(
                color: MineralTheme.primary,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 12),
          ErrorBanner(message: _error ?? ''),
          if (view != null) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('موجودی کیف‌پول', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    Text(
                      formatMoney(view.balance),
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            color: MineralTheme.primary,
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'خانوار #${view.wallet.householdId}',
                      style: const TextStyle(color: MineralTheme.muted, fontSize: 13),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text('تراکنش‌ها', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            if (view.transactions.isEmpty)
              const Text('تراکنشی ثبت نشده است.')
            else
              ...view.transactions.map(
                (t) => Card(
                  child: ListTile(
                    title: Text('${t.type} — ${formatMoney(t.amount)}'),
                    subtitle: Text(t.description ?? (t.createdAt?.toLocal().toString() ?? '')),
                    leading: Icon(
                      t.amount >= 0 ? Icons.arrow_downward : Icons.arrow_upward,
                      color: t.amount >= 0 ? MineralTheme.primary : MineralTheme.danger,
                    ),
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }
}
