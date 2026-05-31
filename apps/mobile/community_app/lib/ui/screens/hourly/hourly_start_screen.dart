import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

import '../../../core/community_api_client.dart';
import '../../../core/hourly_gps.dart';
import '../../../core/hourly_offline_queue.dart';
import '../../../models/hourly_models.dart';
import '../../widgets/error_banner.dart';

/// HOURLY-APP-1: select assignment, start with GPS, show active timer.
class HourlyStartScreen extends StatefulWidget {
  const HourlyStartScreen({
    super.key,
    required this.api,
    required this.token,
    required this.onUnauthorized,
  });

  final CommunityApiClient api;
  final String token;
  final VoidCallback onUnauthorized;

  @override
  State<HourlyStartScreen> createState() => _HourlyStartScreenState();
}

class _HourlyStartScreenState extends State<HourlyStartScreen> {
  bool _loading = true;
  bool _starting = false;
  String? _error;
  OperatorHourlyContext? _ctx;
  OperatorHourlyAssignment? _selected;
  Timer? _timerTicker;
  DateTime? _activeSince;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _timerTicker?.cancel();
    super.dispose();
  }

  void _startTicker(DateTime since) {
    _activeSince = since;
    _timerTicker?.cancel();
    _timerTicker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  String _formatElapsed() {
    final since = _activeSince;
    if (since == null) return '00:00:00';
    final d = DateTime.now().difference(since);
    final h = d.inHours.toString().padLeft(2, '0');
    final m = (d.inMinutes % 60).toString().padLeft(2, '0');
    final s = (d.inSeconds % 60).toString().padLeft(2, '0');
    return '$h:$m:$s';
  }

  Future<void> _bootstrap() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final queue = await HourlyOfflineQueue.open();
      await queue.flush((item) async {
        final kind = item['kind']?.toString();
        if (kind == 'start') {
          await widget.api.startHourly(
            token: widget.token,
            missionId: item['mission_id'] as int,
            vehicleId: item['vehicle_id'] as int,
            householdId: item['household_id'] as int,
            startGeo: HourlyGeo(
              lat: (item['lat'] as num).toDouble(),
              lng: (item['lng'] as num).toDouble(),
            ),
            photoUrl: item['photo_url']?.toString(),
            note: item['note']?.toString(),
          );
        }
      });

      final ctx = await widget.api.getOperatorHourlyContext(token: widget.token);
      if (!mounted) return;
      if (ctx.activeLog != null) {
        final log = ctx.activeLog!;
        _startTicker(log.startedAt ?? DateTime.now());
        Navigator.pushReplacementNamed(
          context,
          '/hourly/end',
          arguments: {
            'token': widget.token,
            'logId': log.id,
            'startedAt': (log.startedAt ?? DateTime.now()).toIso8601String(),
            'equipmentLabel': log.equipmentLabel ?? '—',
          },
        );
        return;
      }
      setState(() {
        _ctx = ctx;
        _selected = ctx.assignments.isNotEmpty ? ctx.assignments.first : null;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (e.isUnauthorized) {
        widget.onUnauthorized();
        return;
      }
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _onStart() async {
    final assignment = _selected;
    if (assignment == null) {
      setState(() => _error = 'ماموریتی برای شروع عملیات ساعتی موجود نیست.');
      return;
    }
    setState(() {
      _starting = true;
      _error = null;
    });
    try {
      final geo = await resolveHourlyGps();
      final log = await widget.api.startHourly(
        token: widget.token,
        missionId: assignment.missionId,
        vehicleId: assignment.vehicleId,
        householdId: assignment.householdId,
        startGeo: geo,
        note: assignment.needId != null ? 'need:${assignment.needId}' : null,
      );
      if (!mounted) return;
      Navigator.pushReplacementNamed(
        context,
        '/hourly/end',
        arguments: {
          'token': widget.token,
          'logId': log.id,
          'startedAt': (log.startedAt ?? DateTime.now()).toIso8601String(),
          'equipmentLabel': assignment.equipmentLabel,
        },
      );
    } on ApiException catch (e) {
      if (e.isNetworkError) {
        final geo = await resolveHourlyGps().catchError((_) => null);
        if (geo != null) {
          final queue = await HourlyOfflineQueue.open();
          await queue.enqueue({
            'kind': 'start',
            'mission_id': assignment.missionId,
            'vehicle_id': assignment.vehicleId,
            'household_id': assignment.householdId,
            'lat': geo.lat,
            'lng': geo.lng,
            'note': assignment.needId != null ? 'need:${assignment.needId}' : null,
          });
          if (!mounted) return;
          setState(() => _error = 'آفلاین ذخیره شد — پس از اتصال همگام می‌شود.');
        } else {
          setState(() => _error = e.message);
        }
      } else if (e.isUnauthorized) {
        widget.onUnauthorized();
      } else {
        setState(() => _error = e.message);
      }
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(title: const Text('شروع عملیات ساعتی')),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (_error != null) ErrorBanner(message: _error!),
                    Text(
                      'تجهیز / ماموریت',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    if ((_ctx?.assignments ?? []).isEmpty)
                      const Text('ماموریت فعالی برای شروع ثبت نشده است.')
                    else
                      DropdownButtonFormField<OperatorHourlyAssignment>(
                        value: _selected,
                        decoration: const InputDecoration(
                          border: OutlineInputBorder(),
                          labelText: 'انتخاب تجهیز',
                        ),
                        items: _ctx!.assignments
                            .map(
                              (a) => DropdownMenuItem(
                                value: a,
                                child: Text(
                                  '${a.equipmentLabel}'
                                  '${a.needLabel != null ? ' · ${a.needLabel}' : ''}',
                                ),
                              ),
                            )
                            .toList(),
                        onChanged: _starting
                            ? null
                            : (v) => setState(() => _selected = v),
                      ),
                    const Spacer(),
                    if (_activeSince != null) ...[
                      Text('زمان فعال', style: Theme.of(context).textTheme.labelLarge),
                      Text(
                        _formatElapsed(),
                        style: Theme.of(context).textTheme.displaySmall,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                    ],
                    SizedBox(
                      height: 48,
                      child: ElevatedButton(
                        onPressed: _starting || (_ctx?.assignments.isEmpty ?? true) ? null : _onStart,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: MineralTheme.primary,
                          foregroundColor: Colors.white,
                        ),
                        child: _starting
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Text('شروع'),
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}
