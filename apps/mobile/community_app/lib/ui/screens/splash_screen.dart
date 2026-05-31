import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

import '../../core/community_api_client.dart';
import '../../core/community_roles.dart';
import '../../core/household_gate.dart';
import '../router.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key, required this.sessionStore});

  final SessionStore sessionStore;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _route();
  }

  Future<void> _route() async {
    final session = await widget.sessionStore.readSession();
    final mineId = await widget.sessionStore.readMineId();
    if (!mounted) return;
    final role = normalizeCommunityRole(session?.role ?? '');
    if (session == null || !isCommunityRole(session.role)) {
      if (session != null) await widget.sessionStore.clearSession();
      Navigator.pushReplacementNamed(context, '/login');
      return;
    }
    final api = CommunityApiClient(baseUrl: AppRouter.baseUrl);
    if (mineId == null) {
      try {
        final workspaces = await api.getWorkspaces(token: session.accessToken);
        final filtered = isMineOperatorRole(role)
            ? workspaces.where((w) => w.isOperational).toList()
            : workspaces.where((w) => w.isCommunity).toList();
        if (!mounted) return;
        if (filtered.length == 1) {
          final ws = filtered.first;
          await api.selectWorkspace(
            token: session.accessToken,
            mineId: ws.mineId,
            cooperativeId: isMineOperatorRole(role) ? null : ws.cooperativeId,
            membershipKind: isMineOperatorRole(role) ? 'OPERATIONAL' : 'COMMUNITY',
          );
          await widget.sessionStore.saveMineId(ws.mineId);
          if (!mounted) return;
          await navigateAfterWorkspace(
            context: context,
            api: api,
            token: session.accessToken,
            role: role,
          );
          return;
        }
      } catch (_) {
        /* fall through to manual select */
      }
      if (!mounted) return;
      Navigator.pushReplacementNamed(
        context,
        '/workspace-select',
        arguments: {'token': session.accessToken, 'role': role},
      );
      return;
    }
    await navigateAfterWorkspace(
      context: context,
      api: api,
      token: session.accessToken,
      role: role,
    );
  }

  @override
  Widget build(BuildContext context) {
    return const Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
    );
  }
}
