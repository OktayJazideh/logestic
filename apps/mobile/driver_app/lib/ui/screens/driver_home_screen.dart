import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';
import 'package:mineral_ui/mineral_ui.dart';

import '../../core/driver_api_client.dart';
import '../../models/api_models.dart';
import '../../models/mission_detail_display.dart';

class DriverHomeScreen extends StatefulWidget {
  const DriverHomeScreen({
    super.key,
    required this.api,
    required this.token,
    required this.sessionStore,
    this.loadDashboard,
  });

  final DriverApiClient api;
  final String token;
  final SessionStore sessionStore;

  /// Test hook — when set, bypasses HTTP and uses this loader instead.
  final Future<DriverDashboard> Function()? loadDashboard;

  @override
  State<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends State<DriverHomeScreen> {
  bool _loading = true;
  String? _error;
  DriverDashboard? _dashboard;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final dashboard = widget.loadDashboard != null
          ? await widget.loadDashboard!()
          : await widget.api.getDriverDashboard(token: widget.token);
      if (!mounted) return;
      setState(() => _dashboard = dashboard);
    } catch (e) {
      if (e is ApiException && e.isUnauthorized) {
        await widget.sessionStore.clearSession();
        if (!mounted) return;
        Navigator.pushNamedAndRemoveUntil(context, '/login', (_) => false);
        return;
      }
      if (e is ApiException && e.isMineNotSelected) {
        final savedMine = await widget.sessionStore.readMineId();
        if (savedMine != null) {
          try {
            await widget.api.selectWorkspace(
              token: widget.token,
              mineId: savedMine,
              membershipKind: 'OPERATIONAL',
            );
            if (!mounted) return;
            await _refresh();
            return;
          } catch (_) {
            /* fall through to mine select */
          }
        }
        if (!mounted) return;
        Navigator.pushReplacementNamed(context, '/mine-select', arguments: widget.token);
        return;
      }
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openMissionDetail(int missionId, {DriverDashboardMission? mission}) {
    Navigator.pushNamed(
      context,
      '/mission-detail',
      arguments: {
        'token': widget.token,
        'missionId': missionId,
        if (mission != null) 'display': MissionDetailDisplay.fromDashboard(mission),
      },
    );
  }

  void _onDeclareReadiness() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('اعلام آمادگی در فاز بعدی فعال می‌شود.')),
    );
  }

  Future<void> _logout() async {
    await widget.sessionStore.clearSession();
    if (!mounted) return;
    Navigator.pushNamedAndRemoveUntil(context, '/login', (_) => false);
  }

  @override
  Widget build(BuildContext context) {
    final dash = _dashboard;

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          title: const Text(BrandNames.driverAppTitle),
          actions: [
            IconButton(
              tooltip: 'مأموریت‌ها',
              icon: const Icon(Icons.list_alt_outlined),
              onPressed: () => Navigator.pushNamed(
                context,
                '/missions',
                arguments: widget.token,
              ),
            ),
            LogoutAppBarButton(onLogout: _logout),
          ],
        ),
        body: RefreshIndicator(
          onRefresh: _refresh,
          child: _loading && dash == null
              ? ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: const [
                    SizedBox(height: 120),
                    Center(child: CircularProgressIndicator()),
                  ],
                )
              : _error != null && dash == null
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(24),
                      children: [
                        Icon(Icons.error_outline, size: 48, color: Theme.of(context).colorScheme.error),
                        const SizedBox(height: 12),
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 16),
                        FilledButton(onPressed: _refresh, child: const Text('تلاش مجدد')),
                      ],
                    )
                  : ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(16),
                      children: [
                        if (dash != null) ...[
                          DriverProfileCard(
                            fullName: dash.driver.fullName,
                            driverCode: dash.driver.driverCode,
                          ),
                          const SizedBox(height: 10),
                          DriverStatusBadge(
                            dashboardState: dash.state,
                            missionStatus: dash.activeMission?.status,
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'مأموریت جاری',
                            style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 8),
                          if (dash.isIdle) _IdleBody(dash: dash),
                          if (dash.isActive && dash.activeMission != null)
                            _ActiveBody(
                              mission: dash.activeMission!,
                              onContinue: () => _openMissionDetail(
                                dash.activeMission!.id,
                                mission: dash.activeMission,
                              ),
                            ),
                          if (dash.isAwaitingWb && dash.activeMission != null)
                            _AwaitingWbBody(
                              mission: dash.activeMission!,
                              onOpen: () => _openMissionDetail(
                                dash.activeMission!.id,
                                mission: dash.activeMission,
                              ),
                            ),
                          const SizedBox(height: 20),
                          Text(
                            'خلاصه امروز',
                            style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 8),
                          TodaySummaryRow(
                            todayTrips: dash.summary.todayTrips,
                            todayKm: dash.summary.todayKm,
                            todayDeliveries: dash.summary.todayDeliveries,
                          ),
                          if (dash.isIdle) ...[
                            const SizedBox(height: 16),
                            SizedBox(
                              height: 48,
                              width: double.infinity,
                              child: OutlinedButton(
                                onPressed: _onDeclareReadiness,
                                child: const Text('اعلام آمادگی'),
                              ),
                            ),
                          ],
                          if (dash.recentHistory.isNotEmpty) ...[
                            const SizedBox(height: 20),
                            _RecentHistorySection(
                              items: dash.recentHistory,
                              onTap: (id) {
                                final hit = dash.recentHistory.where((m) => m.id == id);
                                _openMissionDetail(
                                  id,
                                  mission: hit.isEmpty ? null : hit.first,
                                );
                              },
                            ),
                          ],
                        ],
                      ],
                    ),
        ),
      ),
    );
  }
}

class _IdleBody extends StatelessWidget {
  const _IdleBody({required this.dash});

  final DriverDashboard dash;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Icon(Icons.inbox_outlined, size: 48, color: MineralTheme.muted.withOpacity(0.6)),
            const SizedBox(height: 12),
            const Text(
              'مأموریتی ندارید',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text(
              dash.recentHistory.isEmpty
                  ? 'پس از تخصیص مأموریت جدید، اینجا نمایش داده می‌شود.'
                  : 'در حال حاضر مأموریت فعالی ثبت نشده است.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: MineralTheme.muted, height: 1.4),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActiveBody extends StatelessWidget {
  const _ActiveBody({required this.mission, required this.onContinue});

  final DriverDashboardMission mission;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _MissionRouteCard(mission: mission),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onContinue,
              icon: const Icon(Icons.play_arrow_rounded),
              label: const Text('ادامه مأموریت'),
            ),
          ],
        ),
      ),
    );
  }
}

class _AwaitingWbBody extends StatelessWidget {
  const _AwaitingWbBody({required this.mission, required this.onOpen});

  final DriverDashboardMission mission;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Material(
          color: MineralTheme.accent.withOpacity(0.15),
          borderRadius: BorderRadius.circular(8),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Icon(Icons.scale_outlined, color: MineralTheme.accent.withOpacity(0.95)),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text(
                    'منتظر تأیید باسکول',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _MissionRouteCard(mission: mission),
                const SizedBox(height: 12),
                OutlinedButton(onPressed: onOpen, child: const Text('مشاهده جزئیات')),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _MissionRouteCard extends StatelessWidget {
  const _MissionRouteCard({required this.mission});

  final DriverDashboardMission mission;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.trip_origin, size: 18, color: MineralTheme.primary),
            const SizedBox(width: 8),
            Expanded(child: Text(mission.origin, style: const TextStyle(fontWeight: FontWeight.w600))),
          ],
        ),
        Padding(
          padding: const EdgeInsets.only(right: 8, top: 4, bottom: 4),
          child: Container(width: 2, height: 20, color: MineralTheme.border),
        ),
        Row(
          children: [
            const Icon(Icons.place_outlined, size: 18, color: MineralTheme.muted),
            const SizedBox(width: 8),
            Expanded(child: Text(mission.destination)),
          ],
        ),
        const SizedBox(height: 10),
        Chip(
          label: Text(mission.materialType),
          visualDensity: VisualDensity.compact,
          backgroundColor: MineralTheme.primary.withOpacity(0.08),
        ),
      ],
    );
  }
}

class _RecentHistorySection extends StatelessWidget {
  const _RecentHistorySection({required this.items, required this.onTap});

  final List<DriverDashboardMission> items;
  final void Function(int missionId) onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'تاریخچه اخیر',
          style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        ...items.map(
          (m) => Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              title: Text('${m.origin} → ${m.destination}'),
              subtitle: Text('${m.materialType} · ${MissionStatusBadge.labelFor(m.status)}'),
              trailing: const Icon(Icons.chevron_left),
              onTap: () => onTap(m.id),
            ),
          ),
        ),
      ],
    );
  }
}
