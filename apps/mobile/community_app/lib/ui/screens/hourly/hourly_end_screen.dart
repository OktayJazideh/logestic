import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

import '../../../core/community_api_client.dart';
import '../../../core/hourly_gps.dart';
import '../../../core/hourly_offline_queue.dart';
import '../../../models/hourly_models.dart';
import '../../widgets/error_banner.dart';

/// HOURLY-APP-1: active timer + end with GPS + duration summary.
class HourlyEndScreen extends StatefulWidget {
  const HourlyEndScreen({
    super.key,
    required this.api,
    required this.token,
    required this.logId,
    required this.startedAt,
    required this.equipmentLabel,
    required this.onUnauthorized,
    this.onEnded,
  });

  final CommunityApiClient api;
  final String token;
  final int logId;
  final DateTime startedAt;
  final String equipmentLabel;
  final VoidCallback onUnauthorized;
  final VoidCallback? onEnded;

  @override
  State<HourlyEndScreen> createState() => _HourlyEndScreenState();
}

class _HourlyEndScreenState extends State<HourlyEndScreen> {
  Timer? _ticker;
  bool _ending = false;
  String? _error;
  double? _summaryHours;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
    _flushOfflineEnd();
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  String _formatElapsed() {
    final d = DateTime.now().difference(widget.startedAt);
    final h = d.inHours.toString().padLeft(2, '0');
    final m = (d.inMinutes % 60).toString().padLeft(2, '0');
    final s = (d.inSeconds % 60).toString().padLeft(2, '0');
    return '$h:$m:$s';
  }

  Future<void> _flushOfflineEnd() async {
    try {
      final queue = await HourlyOfflineQueue.open();
      await queue.flush((item) async {
        if (item['kind']?.toString() != 'end') return;
        await widget.api.endHourly(
          token: widget.token,
          logId: item['log_id'] as int,
          endGeo: HourlyGeo(
            lat: (item['lat'] as num).toDouble(),
            lng: (item['lng'] as num).toDouble(),
          ),
          photoUrl: item['photo_url']?.toString(),
        );
      });
    } catch (_) {
      /* best-effort */
    }
  }

  Future<void> _onEnd() async {
    setState(() {
      _ending = true;
      _error = null;
    });
    try {
      final geo = await resolveHourlyGps();
      final log = await widget.api.endHourly(
        token: widget.token,
        logId: widget.logId,
        endGeo: geo,
      );
      if (!mounted) return;
      setState(() => _summaryHours = log.rawHours);
      widget.onEnded?.call();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            log.rawHours != null
                ? 'پایان ثبت شد — مدت: ${log.rawHours!.toStringAsFixed(2)} ساعت'
                : 'پایان عملیات ثبت شد',
          ),
        ),
      );
      Navigator.pushReplacementNamed(
        context,
        '/hourly/start',
        arguments: {'token': widget.token},
      );
    } on ApiException catch (e) {
      if (e.isNetworkError) {
        final geo = await resolveHourlyGps().catchError((_) => null);
        if (geo != null) {
          final queue = await HourlyOfflineQueue.open();
          await queue.enqueue({
            'kind': 'end',
            'log_id': widget.logId,
            'lat': geo.lat,
            'lng': geo.lng,
          });
          setState(() => _error = 'آفلاین ذخیره شد — پس از اتصال ارسال می‌شود.');
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
      if (mounted) setState(() => _ending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(title: const Text('عملیات ساعتی — فعال')),
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_error != null) ErrorBanner(message: _error!),
              Text('تجهیز: ${widget.equipmentLabel}'),
              const SizedBox(height: 8),
              Text('شناسه کارکرد: ${widget.logId}'),
              const SizedBox(height: 24),
              Text('زمان سپری‌شده', style: Theme.of(context).textTheme.titleMedium),
              Text(
                _formatElapsed(),
                style: Theme.of(context).textTheme.displayMedium,
                textAlign: TextAlign.center,
              ),
              if (_summaryHours != null) ...[
                const SizedBox(height: 16),
                Text(
                  'خلاصه: ${_summaryHours!.toStringAsFixed(4)} ساعت خام',
                  style: Theme.of(context).textTheme.titleSmall,
                  textAlign: TextAlign.center,
                ),
              ],
              const Spacer(),
              SizedBox(
                height: 48,
                child: ElevatedButton(
                  onPressed: _ending ? null : _onEnd,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: MineralTheme.primary,
                    foregroundColor: Colors.white,
                  ),
                  child: _ending
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('پایان'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
