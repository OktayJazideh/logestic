import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';
import 'package:mineral_ui/mineral_ui.dart';

import '../../core/community_api_client.dart';
import '../../core/community_roles.dart';
import 'coop/coop_hub_screen.dart';
import 'coop/objections_review_screen.dart';
import 'household/household_hub_screen.dart';
import 'household/monthly_share_screen.dart';
import 'household/objection_screen.dart';
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
        NavigationDestination(icon: Icon(Icons.home_outlined), label: 'خانه'),
        NavigationDestination(icon: Icon(Icons.account_balance_wallet), label: 'کیف‌پول'),
        NavigationDestination(icon: Icon(Icons.pie_chart_outline), label: 'سهم'),
        NavigationDestination(icon: Icon(Icons.report_outlined), label: 'درخواست'),
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
        HouseholdHubScreen(
          onWallet: () => setState(() => _index = 1),
          onShare: () => setState(() => _index = 2),
          onRequest: () => setState(() => _index = 3),
        ),
        WalletScreen(api: widget.api, token: widget.token, onUnauthorized: _logout),
        MonthlyShareScreen(api: widget.api, token: widget.token, onUnauthorized: _logout),
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
            LogoutAppBarButton(onLogout: _logout),
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
