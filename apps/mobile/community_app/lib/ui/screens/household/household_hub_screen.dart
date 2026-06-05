import 'package:flutter/material.dart';
import 'package:mineral_ui/mineral_ui.dart';

/// سه کارت بزرگ خانه خانوار (UX-MOBILE-SIMPLE-1).
class HouseholdHubScreen extends StatelessWidget {
  const HouseholdHubScreen({
    super.key,
    required this.onWallet,
    required this.onShare,
    required this.onRequest,
  });

  final VoidCallback onWallet;
  final VoidCallback onShare;
  final VoidCallback onRequest;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const SimpleStatusCard(
          message: 'یکی از بخش‌های زیر را انتخاب کنید.',
          icon: Icons.home_outlined,
          tone: SimpleStatusTone.info,
        ),
        const SizedBox(height: 16),
        SimpleHomeCard(
          title: 'کیف پول',
          subtitle: 'موجودی و وضعیت حساب شما',
          icon: Icons.account_balance_wallet_outlined,
          onTap: onWallet,
        ),
        const SizedBox(height: 12),
        SimpleHomeCard(
          title: 'سهم ماهانه',
          subtitle: 'مشاهده سهم و تسویه',
          icon: Icons.pie_chart_outline,
          onTap: onShare,
        ),
        const SizedBox(height: 12),
        SimpleHomeCard(
          title: 'اعتراض / درخواست',
          subtitle: 'ثبت اعتراض یا پیگیری',
          icon: Icons.report_outlined,
          onTap: onRequest,
        ),
      ],
    );
  }
}
