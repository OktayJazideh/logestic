import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';
import 'package:mineral_ui/mineral_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/driver_api_client.dart';
import '../../core/in_transit_eta.dart';
import '../../core/mission_flow.dart';
import '../../models/api_models.dart';
import '../widgets/in_transit_map_panel.dart';

/// WF-INTRANSIT-1 — map mine→factory, approx ETA, CTA to factory geofence (no status skip).
class InTransitScreen extends StatefulWidget {
  const InTransitScreen({
    super.key,
    required this.api,
    required this.token,
    required this.missionId,
    this.awaitingWb = false,
    this.loadMission,
  });

  final DriverApiClient api;
  final String token;
  final int missionId;
  final bool awaitingWb;

  /// Test hook — bypasses HTTP.
  final Future<DriverMission?> Function()? loadMission;

  @override
  State<InTransitScreen> createState() => _InTransitScreenState();
}

class _InTransitScreenState extends State<InTransitScreen> {
  bool _loading = true;
  String? _error;
  DriverMission? _mission;

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
      DriverMission? mission;
      if (widget.loadMission != null) {
        mission = await widget.loadMission!();
      } else {
        mission = await widget.api.getDriverMission(
          token: widget.token,
          missionId: widget.missionId,
        );
      }

      if (!mounted) return;

      if (mission == null) {
        setState(() => _error = 'مأموریت یافت نشد.');
        return;
      }

      if (mission.status != 'IN_TRANSIT') {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('این صفحه فقط برای مأموریت در حال حمل است.')),
        );
        return;
      }

      setState(() => _mission = mission);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool get _hasMapCoords {
    final m = _mission;
    return m != null &&
        m.mineLat != null &&
        m.mineLng != null &&
        m.factoryLat != null &&
        m.factoryLng != null;
  }

  void _openFactoryEntry(DriverMission m) {
    Navigator.pushNamed(
      context,
      '/factory-entry',
      arguments: {
        'missionId': m.id,
        'token': widget.token,
        'destination': m.destination,
        'employer_contact': m.employerContact,
      },
    ).then((delivered) {
      if (delivered == true && mounted) {
        Navigator.pop(context, true);
      }
    });
  }

  Future<void> _callEmployer(String contact) async {
    final uri = Uri(scheme: 'tel', path: contact);
    if (!await launchUrl(uri)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تماس برقرار نشد')),
      );
    }
  }

  String? _weightLabel(DriverMission m) {
    final kg = m.approximateWeightKg;
    if (kg == null) return null;
    return '${kg.toStringAsFixed(2)} تن';
  }

  @override
  Widget build(BuildContext context) {
    final m = _mission;

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('در حال حمل'),
        ),
        body: RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              if (_loading && m == null) const LinearProgressIndicator(),
              if (_error != null) ...[
                Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                const SizedBox(height: 12),
                OutlinedButton(onPressed: _refresh, child: const Text('تلاش مجدد')),
              ],
              if (m != null) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: MineralTheme.panel,
                    border: Border.all(color: MineralTheme.border),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    children: [
                      const Text(
                        'در حال حمل',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: MineralTheme.primaryDark),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'In Transit',
                        style: TextStyle(fontSize: 12, color: MineralTheme.muted),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'وضعیت سیستم — فقط خواندنی',
                  style: TextStyle(fontSize: 12, color: MineralTheme.muted),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                MissionIdBadges(loadId: m.loadId, missionId: m.id),
                const SizedBox(height: 16),
                _ReadOnlyInfoTable(mission: m, weightLabel: _weightLabel(m)),
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
                if (_hasMapCoords)
                  InTransitMapPanel(
                    mineLat: m.mineLat!,
                    mineLng: m.mineLng!,
                    factoryLat: m.factoryLat!,
                    factoryLng: m.factoryLng!,
                  )
                else
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        'مختصات نقشه برای این مأموریت پیکربندی نشده است.',
                        style: TextStyle(color: MineralTheme.muted),
                      ),
                    ),
                  ),
                const SizedBox(height: 16),
                if (_hasMapCoords)
                  Row(
                    children: [
                      Icon(Icons.schedule, size: 20, color: MineralTheme.muted),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          formatApproxTransitEta(
                            mineLat: m.mineLat!,
                            mineLng: m.mineLng!,
                            factoryLat: m.factoryLat!,
                            factoryLng: m.factoryLng!,
                          ),
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                if (m.employerContact != null && m.employerContact!.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: IconButton(
                      tooltip: 'تماس با کارفرما',
                      icon: const Icon(Icons.phone_outlined),
                      onPressed: () => _callEmployer(m.employerContact!),
                    ),
                  ),
                ],
                if (widget.awaitingWb ||
                    MissionFlow.showWeighbridgeStatusLink(m.status)) ...[
                  const SizedBox(height: 8),
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
                              ),
                      child: const Text('مشاهده وضعیت باسکول'),
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                SizedBox(
                  height: 48,
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _loading ? null : () => _openFactoryEntry(m),
                    child: const Text('رسیدم به مقصد'),
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

class _ReadOnlyInfoTable extends StatelessWidget {
  const _ReadOnlyInfoTable({required this.mission, this.weightLabel});

  final DriverMission mission;
  final String? weightLabel;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: MineralTheme.panel,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: MineralTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'اطلاعات حمل',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          _Row(label: 'مبدأ', value: mission.origin ?? '—'),
          _Row(label: 'مقصد', value: mission.destination ?? '—'),
          _Row(label: 'نوع بار', value: mission.materialType ?? '—'),
          if (weightLabel != null) _Row(label: 'وزن تقریبی', value: weightLabel!),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(
            flex: 2,
            child: Text(label, style: const TextStyle(fontSize: 13, color: MineralTheme.muted)),
          ),
          Expanded(
            flex: 3,
            child: Text(
              value,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              textAlign: TextAlign.left,
            ),
          ),
        ],
      ),
    );
  }
}
