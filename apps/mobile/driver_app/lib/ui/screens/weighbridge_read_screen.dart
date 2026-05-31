import 'package:flutter/material.dart';
import 'package:intl/intl.dart' hide TextDirection;
import 'package:mineral_api/mineral_api.dart';
import 'package:mineral_ui/mineral_ui.dart';

import '../../core/connectivity_service.dart';
import '../../core/driver_api_client.dart';
import '../../core/offline/weighbridge_status_cache.dart';
import '../../models/api_models.dart';
import '../widgets/weighbridge_read_stepper.dart';

String formatKgFa(int? kg) {
  if (kg == null) return '—';
  final f = NumberFormat.decimalPattern('fa');
  return '${f.format(kg)} کیلوگرم';
}

class WeighbridgeReadScreen extends StatefulWidget {
  const WeighbridgeReadScreen({
    super.key,
    required this.api,
    required this.sessionStore,
    required this.token,
    required this.missionId,
    this.cache,
    this.connectivity,
    this.loadStatus,
  });

  final DriverApiClient api;
  final SessionStore sessionStore;
  final String token;
  final int missionId;
  final WeighbridgeStatusCache? cache;
  final ConnectivityService? connectivity;

  /// Test hook — bypasses HTTP.
  final Future<DriverWeighbridgeStatus> Function()? loadStatus;

  @override
  State<WeighbridgeReadScreen> createState() => _WeighbridgeReadScreenState();
}

class _WeighbridgeReadScreenState extends State<WeighbridgeReadScreen> {
  late final WeighbridgeStatusCache _cache;
  late final ConnectivityService _connectivity;

  bool _loading = true;
  String? _error;
  DriverWeighbridgeStatus? _status;
  bool _fromCache = false;

  @override
  void initState() {
    super.initState();
    _cache = widget.cache ?? WeighbridgeStatusCache();
    _connectivity = widget.connectivity ?? ConnectivityService();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    if (widget.loadStatus == null) {
      await _cache.init();
      _connectivity.start();
    }
    await _refresh();
  }

  @override
  void dispose() {
    if (widget.connectivity == null) {
      _connectivity.dispose();
    }
    super.dispose();
  }

  Future<void> _refresh() async {
    setState(() {
      _loading = true;
      _error = null;
      _fromCache = false;
    });

    try {
      if (widget.loadStatus != null) {
        final s = await widget.loadStatus!();
        setState(() => _status = s);
        return;
      }

      final online = await _connectivity.isOnline;
      if (!online) {
        final cached = _cache.get(widget.missionId);
        if (cached != null) {
          setState(() {
            _status = cached;
            _fromCache = true;
          });
          return;
        }
        setState(() => _error = 'اتصال اینترنت برقرار نیست و دادهٔ ذخیره‌شده‌ای موجود نیست.');
        return;
      }

      final s = await widget.api.getWeighbridgeStatus(
        token: widget.token,
        missionId: widget.missionId,
      );
      await _cache.put(widget.missionId, s);
      setState(() => _status = s);
    } catch (e) {
      if (e is ApiException && e.isUnauthorized) {
        await widget.sessionStore.clearSession();
        if (!mounted) return;
        Navigator.pushNamedAndRemoveUntil(context, '/login', (_) => false);
        return;
      }
      final cached = _cache.get(widget.missionId);
      if (cached != null) {
        setState(() {
          _status = cached;
          _fromCache = true;
          _error = 'نمایش آخرین وضعیت ذخیره‌شده — بروزرسانی ناموفق بود.';
        });
        return;
      }
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = _status;
    final scheme = Theme.of(context).colorScheme;

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(title: const Text('وضعیت باسکول')),
        body: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (s != null && s.paymentHold)
              MaterialBanner(
                backgroundColor: scheme.error,
                content: Text(
                  '۵٪ کرایه تا بررسی عملیات مسدود است',
                  style: TextStyle(color: scheme.onError, fontWeight: FontWeight.w600),
                ),
                leading: Icon(Icons.lock_outline, color: scheme.onError),
                actions: const [SizedBox(width: 8)],
              ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _refresh,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(16),
                  children: [
              if (_loading) const LinearProgressIndicator(),
              if (_fromCache)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    'آفلاین — آخرین وضعیت ذخیره‌شده',
                    style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
                  ),
                ),
              if (_error != null) ...[
                Text(_error!, style: TextStyle(color: scheme.error)),
                const SizedBox(height: 12),
                OutlinedButton(onPressed: _refresh, child: const Text('تلاش مجدد')),
              ],
              if (s != null) ...[
                Row(
                  children: [
                    const Icon(Icons.lock_outline, size: 18, color: MineralTheme.muted),
                    const SizedBox(width: 8),
                    Chip(
                      label: const Text('منبع: اپراتور — فقط خواندنی'),
                      backgroundColor: MineralTheme.panelMuted,
                      side: const BorderSide(color: MineralTheme.border),
                      visualDensity: VisualDensity.compact,
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                if (s.netWeightKg != null)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
                    decoration: BoxDecoration(
                      color: MineralTheme.panel,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: MineralTheme.border, width: 1.5),
                    ),
                    child: Column(
                      children: [
                        const Text(
                          'وزن خالص',
                          style: TextStyle(fontSize: 13, color: MineralTheme.muted, fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          formatKgFa(s.netWeightKg),
                          style: const TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.w800,
                            color: MineralTheme.primaryDark,
                          ),
                        ),
                        const SizedBox(height: 6),
                        const Icon(Icons.lock_outline, size: 20, color: MineralTheme.muted),
                      ],
                    ),
                  ),
                const SizedBox(height: 16),
                if (s.entrySource == 'MANUAL')
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: Chip(
                        avatar: const Icon(Icons.edit_note, size: 18),
                        label: const Text('ثبت دستی — در حال بررسی'),
                        backgroundColor: scheme.tertiaryContainer,
                      ),
                    ),
                  ),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: WeighbridgeReadStepper(ticketStatus: s.ticketStatus),
                  ),
                ),
                const SizedBox(height: 16),
                _WeightCard(label: 'وزن خالی', value: formatKgFa(s.emptyWeightKg)),
                const SizedBox(height: 10),
                _WeightCard(label: 'وزن پر', value: formatKgFa(s.loadedWeightKg)),
                const SizedBox(height: 10),
                _WeightCard(
                  label: 'وزن خالص',
                  value: formatKgFa(s.netWeightKg),
                  emphasized: true,
                ),
                if (s.holdReason != null && s.paymentHold) ...[
                  const SizedBox(height: 16),
                  Text(
                    s.holdReason!,
                    style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant, height: 1.35),
                  ),
                ],
                const SizedBox(height: 24),
                Text(
                  'وزن‌ها توسط اپراتور باسکول یا Agent ثبت می‌شود. راننده امکان ثبت یا تأیید وزن ندارد.',
                  style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant, height: 1.4),
                ),
              ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _WeightCard extends StatelessWidget {
  const _WeightCard({
    required this.label,
    required this.value,
    this.emphasized = false,
  });

  final String label;
  final String value;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
            Text(
              value,
              style: TextStyle(
                fontWeight: emphasized ? FontWeight.w700 : FontWeight.w600,
                fontSize: emphasized ? 16 : 14,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
