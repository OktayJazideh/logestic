import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

import '../../../core/community_api_client.dart';
import '../../../models/community_models.dart';
import '../../widgets/error_banner.dart';

class MonthlyShareScreen extends StatefulWidget {
  const MonthlyShareScreen({
    super.key,
    required this.api,
    required this.token,
    required this.onUnauthorized,
  });

  final CommunityApiClient api;
  final String token;
  final VoidCallback onUnauthorized;

  @override
  State<MonthlyShareScreen> createState() => _MonthlyShareScreenState();
}

class _MonthlyShareScreenState extends State<MonthlyShareScreen> {
  bool _loading = true;
  String? _error;
  HouseholdSharesView? _sharesView;
  HouseholdPoolStatusView? _poolStatus;

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
        widget.api.getHouseholdShares(token: widget.token),
        widget.api.getHouseholdPoolStatus(token: widget.token),
      ]);
      if (!mounted) return;
      setState(() {
        _sharesView = results[0] as HouseholdSharesView;
        _poolStatus = results[1] as HouseholdPoolStatusView;
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

  String _statusLabel(String status) {
    switch (status) {
      case 'PAID':
        return 'پرداخت‌شده';
      case 'CALCULATED':
        return 'محاسبه‌شده';
      default:
        return status;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    final sharesView = _sharesView;
    final poolStatus = _poolStatus;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'سهم ماهانه از استخر اجتماعی — بر اساس سهم ثابت به ازای هر تن تأییدشده '
            '(مستقل از کرایه) و توزیع POOL_DISTRIBUTION',
            style: TextStyle(color: MineralTheme.muted, fontSize: 13),
          ),
          if (sharesView != null) ...[
            const SizedBox(height: 6),
            Text(
              'نرخ جاری: ${formatMoney(sharesView.communityRialPerTon, display: 'toman')} به ازای هر تن تأییدشده',
              style: const TextStyle(color: MineralTheme.primary, fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ],
          if (poolStatus != null) ...[
            const SizedBox(height: 12),
            Card(
              color: MineralTheme.primary.withOpacity(0.06),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  'استخر دوره ${poolStatus.periodKey}: ${formatMoney(poolStatus.poolTotalRial)} — '
                  'سهم تقریبی شما: ${formatMoney(poolStatus.estimatedShareRial)}',
                  style: const TextStyle(
                    color: MineralTheme.primaryDark,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    height: 1.5,
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(height: 12),
          ErrorBanner(message: _error ?? ''),
          if (sharesView == null || sharesView.shares.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Text('هنوز سهم ماهانه‌ای برای این دوره توزیع نشده است.'),
              ),
            )
          else ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('جمع دوره ${sharesView.periodKey}', style: Theme.of(context).textTheme.titleMedium),
                    Text(
                      formatMoney(sharesView.totalRial),
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: MineralTheme.primary,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            ...sharesView.shares.map(
              (s) => Card(
                child: ListTile(
                  title: Text(s.descriptionFa ?? 'سهم استخر اجتماعی'),
                  subtitle: Text(
                    '${_statusLabel(s.status)}'
                    '${s.missionId != null ? ' · مأموریت ${s.missionId}' : ''}',
                  ),
                  trailing: Text(
                    formatMoney(s.amount),
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: MineralTheme.primary,
                    ),
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
