import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';
import 'package:mineral_ui/format_money.dart';
import 'package:mineral_ui/mineral_ui.dart';

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
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null)
            PlainLanguageError(
              message: _error!,
              whatToDo: 'اتصال را بررسی کنید و بکشید برای بروزرسانی.',
              onRetry: _load,
            ),
          if (view != null) ...[
            const Text(
              'موجودی شما',
              style: TextStyle(
                fontFamily: MineralTheme.fontFamily,
                fontSize: MineralTheme.fontSizeBody,
                fontWeight: FontWeight.w600,
                color: MineralTheme.muted,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Text(
              formatMoney(view.balance),
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontFamily: MineralTheme.fontFamily,
                fontSize: 36,
                fontWeight: FontWeight.w800,
                color: MineralTheme.primaryDark,
              ),
            ),
            if (view.communityRialPerTon != null) ...[
              const SizedBox(height: 16),
              SimpleStatusCard(
                message: 'نرخ سهم: ${formatMoney(view.communityRialPerTon!)} به ازای هر تن تأییدشده',
                icon: Icons.info_outline,
                tone: SimpleStatusTone.info,
              ),
            ],
          ],
        ],
      ),
    );
  }
}
