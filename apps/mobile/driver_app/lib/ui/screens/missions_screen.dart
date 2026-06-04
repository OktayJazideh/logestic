import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';
import 'package:mineral_ui/mineral_ui.dart';

import '../../core/driver_api_client.dart';
import '../../core/mission_flow.dart';
import '../../models/api_models.dart';

class MissionsScreen extends StatefulWidget {
  const MissionsScreen({
    super.key,
    required this.api,
    required this.token,
    required this.sessionStore,
  });

  final DriverApiClient api;
  final String token;
  final SessionStore sessionStore;

  @override
  State<MissionsScreen> createState() => _MissionsScreenState();
}

class _MissionsScreenState extends State<MissionsScreen> {
  bool _loading = false;
  String? _error;
  List<DriverMission> _missions = [];

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
      final missions = await widget.api.getDriverMissions(token: widget.token);
      setState(() => _missions = missions);
    } catch (e) {
      if (e is ApiException && e.isUnauthorized) {
        await widget.sessionStore.clearSession();
        if (!mounted) return;
        Navigator.pushNamedAndRemoveUntil(context, '/login', (_) => false);
        return;
      }
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openDetail(DriverMission m) {
    Navigator.pushNamed(
      context,
      '/mission-detail',
      arguments: {
        'token': widget.token,
        'missionId': m.id,
      },
    );
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'DELIVERED':
      case 'VERIFIED':
      case 'SETTLED':
        return const Color(0xFF1B5E20);
      case 'IN_TRANSIT':
        return const Color(0xFFB45309);
      default:
        return const Color(0xFF374151);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('ماموریت‌های فعال'),
          actions: [
            LogoutAppBarButton(
              onLogout: () async {
                await widget.sessionStore.clearSession();
                if (!mounted) return;
                Navigator.pushNamedAndRemoveUntil(context, '/login', (_) => false);
              },
            ),
          ],
        ),
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_loading) const LinearProgressIndicator(),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ],
              const SizedBox(height: 12),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: _refresh,
                  child: _missions.isEmpty
                      ? ListView(
                          children: [
                            const SizedBox(height: 120),
                            Center(
                              child: Text(
                                'ماموریتی برای شما وجود ندارد.',
                                style: TextStyle(color: Colors.black.withOpacity(0.7)),
                              ),
                            ),
                          ],
                        )
                      : ListView.separated(
                          itemCount: _missions.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 12),
                          itemBuilder: (context, i) {
                            final m = _missions[i];
                            final statusColor = _statusColor(m.status);
                            final uiStep = MissionFlow.uiStepIndexFromStatus(m.status);

                            return Card(
                              child: InkWell(
                                borderRadius: BorderRadius.circular(12),
                                onTap: () => _openDetail(m),
                                child: Padding(
                                  padding: const EdgeInsets.all(16),
                                  child: Row(
                                    children: [
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              'مأموریت #${m.id}',
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .titleMedium
                                                  ?.copyWith(fontWeight: FontWeight.w700),
                                            ),
                                            const SizedBox(height: 6),
                                            Text(
                                              MissionFlow.uiStepLabelsFa[uiStep],
                                              style: TextStyle(
                                                fontSize: 13,
                                                color: Colors.black.withOpacity(0.6),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 10,
                                          vertical: 5,
                                        ),
                                        decoration: BoxDecoration(
                                          color: statusColor.withOpacity(0.1),
                                          borderRadius: BorderRadius.circular(999),
                                          border: Border.all(
                                            color: statusColor.withOpacity(0.3),
                                          ),
                                        ),
                                        child: Text(
                                          MissionFlow.labelFa(m.status),
                                          style: TextStyle(
                                            color: statusColor,
                                            fontSize: 12,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                      ),
                                      const Icon(Icons.chevron_left),
                                    ],
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
