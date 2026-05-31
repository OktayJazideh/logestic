import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

import '../../core/community_api_client.dart';
import '../../core/community_roles.dart';
import 'coop/coop_hub_screen.dart';
import 'coop/objections_review_screen.dart';
import 'household/monthly_share_screen.dart';
import 'household/objection_screen.dart';
import 'household/settlement_status_screen.dart';
import 'household/wallet_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({
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
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  Future<void> _logout() async {
    await widget.sessionStore.clearSession();
    if (!mounted) return;
    Navigator.pushNamedAndRemoveUntil(context, '/login', (_) => false);
  }

  List<NavigationDestination> _destinations() {
    if (isHouseholdRole(widget.role)) {
      return const [
        NavigationDestination(icon: Icon(Icons.account_balance_wallet), label: 'کیف‌پول'),
        NavigationDestination(icon: Icon(Icons.pie_chart_outline), label: 'سهم ماهانه'),
        NavigationDestination(icon: Icon(Icons.fact_check_outlined), label: 'تسویه'),
        NavigationDestination(icon: Icon(Icons.report_outlined), label: 'اعتراض'),
      ];
    }
    if (isCoopOperatorRole(widget.role)) {
      return const [
        NavigationDestination(icon: Icon(Icons.groups_outlined), label: 'تعاونی'),
      ];
    }
    return const [
      NavigationDestination(icon: Icon(Icons.groups_outlined), label: 'تعاونی'),
      NavigationDestination(icon: Icon(Icons.gavel_outlined), label: 'اعتراض‌ها'),
    ];
  }

  List<Widget> _pages() {
    final hub = CoopHubScreen(
      api: widget.api,
      token: widget.token,
      onUnauthorized: _logout,
    );
    if (isHouseholdRole(widget.role)) {
      return [
        WalletScreen(api: widget.api, token: widget.token, onUnauthorized: _logout),
        MonthlyShareScreen(api: widget.api, token: widget.token, onUnauthorized: _logout),
        SettlementStatusScreen(api: widget.api, token: widget.token, onUnauthorized: _logout),
        ObjectionScreen(api: widget.api, token: widget.token, onUnauthorized: _logout),
      ];
    }
    if (isCoopOperatorRole(widget.role)) {
      return [hub];
    }
    return [
      hub,
      ObjectionsReviewScreen(
        api: widget.api,
        token: widget.token,
        onUnauthorized: _logout,
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final pages = _pages();
    final idx = _index.clamp(0, pages.length - 1);

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          title: Text('پنل ${roleLabelFa(widget.role)}'),
          actions: [
            IconButton(
              tooltip: 'خروج',
              onPressed: _logout,
              icon: const Icon(Icons.logout),
            ),
          ],
        ),
        body: IndexedStack(
          index: idx,
          children: pages,
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: idx,
          onDestinationSelected: (i) => setState(() => _index = i),
          destinations: _destinations(),
        ),
      ),
    );
  }
}
