import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/mission_flow.dart';
import '../../core/session_store.dart';
import '../../models/api_models.dart';
import '../widgets/mission_stepper.dart';
import '../widgets/weighbridge_flow_strip.dart';

class MissionsScreen extends StatefulWidget {
  const MissionsScreen({
    super.key,
    required this.api,
    required this.token,
    required this.sessionStore,
  });

  final ApiClient api;
  final String token;
  final SessionStore sessionStore;

  @override
  State<MissionsScreen> createState() => _MissionsScreenState();
}

class _MissionsScreenState extends State<MissionsScreen> {
  bool _loading = false;
  String? _error;
  List<DriverMission> _missions = [];
  /// Weighbridge ticket per mission (only fetched for COMPLETED missions).
  final Map<int, WeighbridgeTicket?> _ticketByMissionId = {};

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
      final completed = missions.where((m) => m.status == 'COMPLETED').toList();
      final tickets = <int, WeighbridgeTicket?>{};
      await Future.wait(
        completed.map((m) async {
          try {
            tickets[m.id] = await widget.api.getMissionTicket(
              token: widget.token,
              missionId: m.id,
            );
          } catch (_) {
            tickets[m.id] = null;
          }
        }),
      );
      setState(() {
        _missions = missions;
        _ticketByMissionId
          ..clear()
          ..addAll(tickets);
      });
    } catch (e) {
      if (e is ApiException && e.isUnauthorized) {
        await _logout();
        return;
      }
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  String _nextStep(String status) {
    final i = MissionFlow.driverStepOrder.indexOf(status);
    if (i < 0 || i >= MissionFlow.driverStepOrder.length - 1) return status;
    return MissionFlow.driverStepOrder[i + 1];
  }

  Future<void> _goNext(DriverMission m) async {
    setState(() => _loading = true);
    try {
      final next = _nextStep(m.status);
      await widget.api.updateMissionStep(
        token: widget.token,
        missionId: m.id,
        step: next,
      );
      await _refresh();
    } catch (e) {
      if (e is ApiException && e.isUnauthorized) {
        await _logout();
        return;
      }
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _logout() async {
    await widget.sessionStore.clearSession();
    if (!mounted) return;
    Navigator.pushNamedAndRemoveUntil(context, '/login', (route) => false);
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'COMPLETED':
        return const Color(0xFF1B5E20);
      case 'UNLOADING':
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
            IconButton(
              tooltip: 'خروج',
              onPressed: _logout,
              icon: const Icon(Icons.logout),
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
                Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
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
                            final canGoNext = m.status != 'COMPLETED';
                            final statusColor = _statusColor(m.status);
                            final ticket = _ticketByMissionId[m.id];
                            final showWbChain = m.status == 'COMPLETED';

                            return Card(
                              child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.stretch,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            'ماموریت #${m.id}',
                                            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                          decoration: BoxDecoration(
                                            color: statusColor.withOpacity(0.1),
                                            borderRadius: BorderRadius.circular(999),
                                            border: Border.all(color: statusColor.withOpacity(0.3)),
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
                                      ],
                                    ),
                                    const SizedBox(height: 10),
                                    Container(
                                      padding: const EdgeInsets.all(10),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFF9FAFB),
                                        borderRadius: BorderRadius.circular(10),
                                        border: Border.all(color: const Color(0xFFE5E7EB)),
                                      ),
                                      child: Wrap(
                                        spacing: 18,
                                        runSpacing: 8,
                                        children: [
                                          Text('Load: ${m.loadId}'),
                                          Text('Mine: ${m.mineId}'),
                                          Text('Vehicle: ${m.vehicleId}'),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(height: 12),
                                    MissionStepper(
                                      currentStatus: m.status,
                                      onNext: () => _goNext(m),
                                      canGoNext: canGoNext,
                                    ),
                                    if (m.status != 'COMPLETED')
                                      Padding(
                                        padding: const EdgeInsets.only(top: 8),
                                        child: Text(
                                          'پس از «اتمام عملیات راننده»، تیکت باسکول صادر و زنجیره وزن‌گیری آغاز می‌شود.',
                                          style: TextStyle(
                                            fontSize: 12,
                                            color: Colors.black.withOpacity(0.55),
                                            height: 1.35,
                                          ),
                                        ),
                                      ),
                                    if (showWbChain) ...[
                                      const SizedBox(height: 12),
                                      WeighbridgeFlowStrip(
                                        ticketStatus: ticket?.status,
                                        ticketPending: ticket == null,
                                      ),
                                      const SizedBox(height: 8),
                                      OutlinedButton.icon(
                                        onPressed: () {
                                          Navigator.pushNamed(
                                            context,
                                            '/ticket',
                                            arguments: {'token': widget.token, 'missionId': m.id},
                                          );
                                        },
                                        icon: const Icon(Icons.receipt_long_outlined),
                                        label: const Text('جزئیات وضعیت باسکول'),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                ),
              ),
              if (!_loading && _missions.isNotEmpty)
                TextButton.icon(
                  onPressed: _refresh,
                  icon: const Icon(Icons.refresh),
                  label: const Text('بروزرسانی'),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

