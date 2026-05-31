import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

import 'package:mineral_ui/mineral_ui.dart';

import '../../core/connectivity_service.dart';
import '../../core/driver_api_client.dart';
import '../../core/mission_flow.dart';
import '../../core/offline/mission_step_queue_item.dart';
import '../../core/offline/mission_step_queue_store.dart';
import '../../core/offline/mission_sync_service.dart';
import '../../models/api_models.dart';
import '../../models/mission_detail_display.dart';
import '../widgets/weighbridge_flow_strip.dart';

class MissionDetailScreen extends StatefulWidget {
  const MissionDetailScreen({
    super.key,
    required this.api,
    required this.token,
    required this.missionId,
    required this.sessionStore,
    this.display,
    this.queueStore,
    this.connectivity,
    this.loadMission,
  });

  final DriverApiClient api;
  final String token;
  final int missionId;
  final SessionStore sessionStore;
  final MissionDetailDisplay? display;
  final MissionStepQueueStore? queueStore;
  final ConnectivityService? connectivity;

  /// Test hook — bypasses missions list fetch.
  final Future<DriverMission?> Function()? loadMission;

  @override
  State<MissionDetailScreen> createState() => _MissionDetailScreenState();
}

class _MissionDetailScreenState extends State<MissionDetailScreen> {
  late final MissionStepQueueStore _queueStore;
  late final ConnectivityService _connectivity;
  late final MissionSyncService _syncService;

  bool _loading = true;
  String? _error;
  DriverMission? _mission;
  MissionDetailDisplay? _display;
  WeighbridgeTicket? _ticket;
  bool _pendingSync = false;

  StreamSubscription<bool>? _connectivitySub;

  @override
  void initState() {
    super.initState();
    _display = widget.display;
    _queueStore = widget.queueStore ?? MissionStepQueueStore();
    _connectivity = widget.connectivity ?? ConnectivityService();
    _syncService = MissionSyncService(
      api: widget.api,
      store: _queueStore,
      connectivity: _connectivity,
    );
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    await _queueStore.init();
    _connectivity.start();
    _connectivitySub = _connectivity.onOnline.listen((online) {
      if (online) _trySync(showSnackOnConflict: true);
    });
    await _refresh();
    if (await _connectivity.isOnline) {
      await _trySync(showSnackOnConflict: false);
    }
  }

  @override
  void dispose() {
    _connectivitySub?.cancel();
    if (widget.connectivity == null) {
      _connectivity.dispose();
    }
    super.dispose();
  }

  DriverMission? get _effectiveMission {
    final m = _mission;
    if (m == null) return null;
    final optimistic = _queueStore.optimisticStatusForMission(m.id);
    if (optimistic == null) return m;
    return m.copyWith(status: optimistic);
  }

  Future<void> _refresh() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      DriverMission? mission;
      if (widget.loadMission != null) {
        mission = await widget.loadMission!();
      } else {
        final missions = await widget.api.getDriverMissions(token: widget.token);
        for (final item in missions) {
          if (item.id == widget.missionId) {
            mission = item;
            break;
          }
        }
      }

      if (mission == null) {
        setState(() => _error = 'مأموریت یافت نشد.');
        return;
      }

      WeighbridgeTicket? ticket;
      if (mission.status == 'DELIVERED') {
        try {
          ticket = await widget.api.getMissionTicket(
            token: widget.token,
            missionId: mission.id,
          );
        } catch (_) {
          ticket = null;
        }
      }

      setState(() {
        _mission = mission;
        _display ??= MissionDetailDisplay.fromMission(mission!);
        _ticket = ticket;
        _pendingSync = _queueStore.hasPending(mission!.id);
      });
    } catch (e) {
      if (e is ApiException && e.isUnauthorized) {
        await _logout();
        return;
      }
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _logout() async {
    await widget.sessionStore.clearSession();
    if (!mounted) return;
    Navigator.pushNamedAndRemoveUntil(context, '/login', (_) => false);
  }

  Future<void> _enqueueOfflineStep({
    required DriverMission m,
    required String next,
  }) async {
    final item = MissionStepQueueItem(
      id: MineralApiClient.newIdempotencyKey(),
      missionId: m.id,
      step: next,
      previousStatus: m.status,
      createdAt: DateTime.now().toUtc(),
    );
    await _queueStore.enqueue(item);
    setState(() {
      _mission = m.copyWith(status: next);
      _pendingSync = true;
    });
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('ذخیره شد — در انتظار همگام‌سازی با سرور'),
        duration: Duration(seconds: 3),
      ),
    );
  }

  Future<void> _advance(DriverMission m) async {
    final next = MissionFlow.nextDriverStep(m.status);
    if (next == null) return;

    setState(() => _loading = true);
    try {
      final online = await _connectivity.isOnline;
      if (online && _queueStore.hasPending(m.id)) {
        await _trySync(showSnackOnConflict: true);
        if (!mounted) return;
      }

      if (!online) {
        await _enqueueOfflineStep(m: m, next: next);
        return;
      }

      await widget.api.advanceMission(
        token: widget.token,
        missionId: m.id,
        step: next,
        idempotencyKey: MineralApiClient.newIdempotencyKey(),
      );
      await _refresh();
    } catch (e) {
      if (e is ApiException && e.isUnauthorized) {
        await _logout();
        return;
      }
      if (e is ApiException && e.isNetworkError) {
        await _enqueueOfflineStep(m: m, next: next);
        return;
      }
      if (e is ApiException && e.isInvalidTransition) {
        await _handleConflict(m.id, e.message);
        return;
      }
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _trySync({required bool showSnackOnConflict}) async {
    if (!mounted) return;
    try {
      final result = await _syncService.syncPending(token: widget.token);
      if (!mounted) return;

      if (result.outcome == SyncOutcome.conflict && showSnackOnConflict) {
        await _handleConflict(
          result.conflictMissionId!,
          result.message ?? 'تعارض وضعیت ماموریت',
        );
        return;
      }

      if (result.outcome == SyncOutcome.completed ||
          result.outcome == SyncOutcome.conflict) {
        await _refresh();
      }
    } on ApiException catch (e) {
      if (e.isUnauthorized) await _logout();
    }
  }

  Future<void> _handleConflict(int missionId, String message) async {
    await _queueStore.removeAllForMission(missionId);
    await _refresh();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Theme.of(context).colorScheme.error,
      ),
    );
  }

  Map<String, dynamic> _unloadRouteArgs(DriverMission m) {
    final d = _display;
    return {
      'missionId': m.id,
      'token': widget.token,
      'destination': d?.destination ?? m.destination,
      'employer_contact': d?.employerContact ?? m.employerContact,
    };
  }

  void _onPrimaryPressed(DriverMission m) {
    if (MissionFlow.mustConfirmGeofenceBeforeAdvance(m.status)) {
      Navigator.pushNamed(
        context,
        '/mine-entry',
        arguments: {'missionId': m.id, 'token': widget.token},
      ).then((_) => _refresh());
      return;
    }
    if (MissionFlow.mustUseInTransitScreen(m.status)) {
      Navigator.pushNamed(
        context,
        '/mission/${m.id}/in-transit',
        arguments: {
          'missionId': m.id,
          'token': widget.token,
        },
      ).then((_) => _refresh());
      return;
    }
    if (MissionFlow.mustConfirmUnloadBeforeAdvance(m.status)) {
      Navigator.pushNamed(
        context,
        '/unload-confirm',
        arguments: _unloadRouteArgs(m),
      ).then((_) => _refresh());
      return;
    }
    if (MissionFlow.canAdvanceInPlace(m.status)) {
      _advance(m);
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = _effectiveMission;
    final display = _display;

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(title: Text(m != null ? 'مأموریت #${m.id}' : 'جزئیات مأموریت')),
        body: RefreshIndicator(
          onRefresh: () async {
            await _refresh();
            await _trySync(showSnackOnConflict: true);
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              if (_loading && m == null) const LinearProgressIndicator(),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                const SizedBox(height: 12),
                OutlinedButton(onPressed: _refresh, child: const Text('تلاش مجدد')),
              ],
              if (m != null) ...[
                if (_pendingSync)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Material(
                      color: MineralTheme.accent.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(8),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        child: Text(
                          'در انتظار همگام‌سازی با سرور',
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            color: MineralTheme.accent,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ),
                  ),
                Align(
                  alignment: Alignment.centerRight,
                  child: MissionStatusBadge(status: m.status),
                ),
                const SizedBox(height: 12),
                MissionIdBadges(loadId: m.loadId, missionId: m.id),
                const SizedBox(height: 16),
                Text(
                  'پیشرفت مأموریت',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 12),
                VerticalMissionStepper(
                  currentStepIndex: MissionFlow.uiStepIndexFromStatus(m.status),
                  labels: MissionFlow.uiStepLabelsFa,
                ),
                const SizedBox(height: 20),
                _MissionDetailsCard(mission: m, display: display),
                if (MissionFlow.showWeighbridgeStatusLink(m.status)) ...[
                  const SizedBox(height: 12),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: _loading
                          ? null
                          : () => Navigator.pushNamed(
                                context,
                                '/missions/${m.id}/weighbridge',
                                arguments: {
                                  'token': widget.token,
                                  'missionId': m.id,
                                },
                              ).then((_) => _refresh()),
                      child: const Text('مشاهده وضعیت باسکول'),
                    ),
                  ),
                ],
                if (m.status == 'DELIVERED') ...[
                  const SizedBox(height: 16),
                  WeighbridgeFlowStrip(
                    ticketStatus: _ticket?.status,
                    ticketPending: _ticket == null,
                  ),
                ],
                const SizedBox(height: 24),
                SizedBox(
                  height: 48,
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _loading ||
                            MissionFlow.isDriverTerminal(m.status) ||
                            (!MissionFlow.canAdvanceInPlace(m.status) &&
                                !MissionFlow.mustConfirmGeofenceBeforeAdvance(m.status) &&
                                !MissionFlow.mustConfirmFactoryGeofenceBeforeAdvance(m.status) &&
                                !MissionFlow.mustConfirmUnloadBeforeAdvance(m.status))
                        ? null
                        : () => _onPrimaryPressed(m),
                    child: Text(MissionFlow.primaryActionLabel(m.status)),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _MissionDetailsCard extends StatelessWidget {
  const _MissionDetailsCard({
    required this.mission,
    required this.display,
  });

  final DriverMission mission;
  final MissionDetailDisplay? display;

  @override
  Widget build(BuildContext context) {
    final plate = display?.licensePlate ?? mission.licensePlate ?? 'خودرو #${mission.vehicleId}';
    final destination = display?.destination ?? mission.destination ?? '—';
    final weight = display?.approximateWeightKg ??
        mission.approximateWeightKg ??
        (display?.materialType != null || mission.materialType != null
            ? null
            : null);
    final weightLabel = weight != null ? '${weight.toStringAsFixed(1)} تن' : '—';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'اطلاعات بار',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            _DetailRow(icon: Icons.trip_origin, label: 'مبدأ', value: display?.origin ?? mission.origin ?? '—'),
            const SizedBox(height: 10),
            _DetailRow(icon: Icons.place_outlined, label: 'مقصد', value: destination),
            const SizedBox(height: 10),
            _DetailRow(
              icon: Icons.inventory_2_outlined,
              label: 'نوع بار',
              value: display?.materialType ?? mission.materialType ?? '—',
            ),
            const SizedBox(height: 10),
            _DetailRow(icon: Icons.scale_outlined, label: 'وزن تقریبی', value: weightLabel),
            const SizedBox(height: 10),
            _DetailRow(icon: Icons.directions_car_outlined, label: 'پلاک', value: plate),
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: MineralTheme.muted),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(fontSize: 12, color: MineralTheme.muted)),
              const SizedBox(height: 2),
              Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ],
    );
  }
}
