import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mineral_api/mineral_api.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/connectivity_service.dart';
import '../../core/driver_api_client.dart';
import '../../core/mission_flow.dart';
import '../../core/offline/mission_step_queue_item.dart';
import '../../core/offline/mission_step_queue_store.dart';
import '../../models/api_models.dart';

/// WF-UNLOAD-1 — unload confirmation before IN_TRANSIT → DELIVERED.
class UnloadConfirmScreen extends StatefulWidget {
  const UnloadConfirmScreen({
    super.key,
    required this.api,
    required this.token,
    required this.missionId,
    this.destination,
    this.employerContact,
    this.latitude,
    this.longitude,
    this.accuracyM,
    this.distanceM,
    this.loadMission,
    this.queueStore,
    this.connectivity,
    this.pickReceiptPhoto,
  });

  final DriverApiClient api;
  final String token;
  final int missionId;
  final String? destination;
  final String? employerContact;
  final double? latitude;
  final double? longitude;
  final double? accuracyM;
  final double? distanceM;
  final Future<DriverMission?> Function()? loadMission;
  final MissionStepQueueStore? queueStore;
  final ConnectivityService? connectivity;

  /// Test hook — bypasses [ImagePicker].
  final Future<Uint8List?> Function()? pickReceiptPhoto;

  @override
  State<UnloadConfirmScreen> createState() => _UnloadConfirmScreenState();
}

class _UnloadConfirmScreenState extends State<UnloadConfirmScreen> {
  static const _maxReceiptBytes = 2 * 1024 * 1024;

  late final MissionStepQueueStore _queueStore;
  late final ConnectivityService _connectivity;

  bool _loadingMission = true;
  String? _loadError;
  DriverMission? _mission;

  bool _unloadComplete = false;
  bool _noDiscrepancy = false;
  Uint8List? _receiptBytes;
  String? _receiptError;

  bool _submitting = false;
  bool _locating = false;
  String? _locationError;

  bool get _canConfirm => _unloadComplete && _noDiscrepancy && !_submitting && !_loadingMission;

  @override
  void initState() {
    super.initState();
    _queueStore = widget.queueStore ?? MissionStepQueueStore();
    _connectivity = widget.connectivity ?? ConnectivityService();
    _bootstrap();
  }

  @override
  void dispose() {
    if (widget.connectivity == null) {
      _connectivity.dispose();
    }
    super.dispose();
  }

  Future<void> _bootstrap() async {
    await _queueStore.init();
    _connectivity.start();
    await _loadMission();
  }

  Future<void> _loadMission() async {
    setState(() {
      _loadingMission = true;
      _loadError = null;
    });
    try {
      DriverMission? mission;
      if (widget.loadMission != null) {
        mission = await widget.loadMission!();
      } else {
        final missions = await widget.api.getDriverMissions(token: widget.token);
        for (final m in missions) {
          if (m.id == widget.missionId) {
            mission = m;
            break;
          }
        }
      }
      if (!mounted) return;
      if (mission == null) {
        setState(() => _loadError = 'مأموریت یافت نشد.');
      } else if (mission.status != 'IN_TRANSIT') {
        setState(() => _loadError = 'این مأموریت در وضعیت حمل نیست.');
      } else {
        setState(() => _mission = mission);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadError = e.toString());
    } finally {
      if (mounted) setState(() => _loadingMission = false);
    }
  }

  String get _destinationLabel {
    final m = _mission;
    return widget.destination ?? m?.destination ?? '—';
  }

  String? get _employerContact {
    final m = _mission;
    return widget.employerContact ?? m?.employerContact;
  }

  Future<void> _pickReceipt() async {
    setState(() {
      _receiptError = null;
    });
    try {
      Uint8List? bytes;
      if (widget.pickReceiptPhoto != null) {
        bytes = await widget.pickReceiptPhoto!();
      } else {
        final file = await ImagePicker().pickImage(
          source: ImageSource.camera,
          maxWidth: 1600,
          imageQuality: 85,
        );
        if (file == null) return;
        bytes = await file.readAsBytes();
      }
      if (bytes == null) return;
      if (bytes.length > _maxReceiptBytes) {
        setState(() => _receiptError = 'حجم عکس زیاد است. عکس کوچک‌تری بگیرید.');
        return;
      }
      setState(() => _receiptBytes = bytes);
    } catch (e) {
      setState(() => _receiptError = 'خطا در انتخاب عکس: $e');
    }
  }

  void _clearReceipt() {
    setState(() {
      _receiptBytes = null;
      _receiptError = null;
    });
  }

  Future<({double lat, double lng, double? accuracyM, double? distanceM})?> _resolveLocation() async {
    if (widget.latitude != null && widget.longitude != null) {
      return (
        lat: widget.latitude!,
        lng: widget.longitude!,
        accuracyM: widget.accuracyM,
        distanceM: widget.distanceM,
      );
    }

    setState(() {
      _locating = true;
      _locationError = null;
    });
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        setState(() => _locationError = 'دسترسی به موقعیت مکانی داده نشد.');
        return null;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      return (lat: pos.latitude, lng: pos.longitude, accuracyM: pos.accuracy, distanceM: null);
    } catch (e) {
      setState(() => _locationError = 'خطا در دریافت GPS: $e');
      return null;
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  String? _receiptBase64() {
    final bytes = _receiptBytes;
    if (bytes == null) return null;
    return base64Encode(bytes);
  }

  Future<void> _confirmDelivery() async {
    if (!_canConfirm) return;

    final loc = await _resolveLocation();
    if (loc == null) {
      if (_locationError == null && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('موقعیت GPS برای تأیید تحویل لازم است.')),
        );
      }
      return;
    }

    setState(() => _submitting = true);
    final receiptB64 = _receiptBase64();
    try {
      final online = await _connectivity.isOnline;
      if (!online) {
        await _enqueueOffline(loc, receiptB64);
        if (!mounted) return;
        Navigator.pop(context, true);
        return;
      }

      await widget.api.advanceMission(
        token: widget.token,
        missionId: widget.missionId,
        step: 'DELIVERED',
        latitude: loc.lat,
        longitude: loc.lng,
        accuracyM: loc.accuracyM,
        distanceM: loc.distanceM,
        receiptPhotoBase64: receiptB64,
        idempotencyKey: MineralApiClient.newIdempotencyKey(),
      );
      if (!mounted) return;
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isNetworkError) {
        await _enqueueOffline(loc, receiptB64);
        Navigator.pop(context, true);
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: Theme.of(context).colorScheme.error),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _enqueueOffline(
    ({double lat, double lng, double? accuracyM, double? distanceM}) loc,
    String? receiptB64,
  ) async {
    final item = MissionStepQueueItem(
      id: MineralApiClient.newIdempotencyKey(),
      missionId: widget.missionId,
      step: 'DELIVERED',
      previousStatus: 'IN_TRANSIT',
      createdAt: DateTime.now().toUtc(),
      latitude: loc.lat,
      longitude: loc.lng,
      accuracyM: loc.accuracyM,
      distanceM: loc.distanceM,
      receiptPhotoBase64: receiptB64,
    );
    await _queueStore.enqueue(item);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('ذخیره شد — در انتظار همگام‌سازی با سرور'),
        duration: Duration(seconds: 3),
      ),
    );
  }

  Future<void> _callEmployer() async {
    final raw = _employerContact;
    if (raw == null || raw.trim().isEmpty) return;
    final tel = raw.trim().replaceAll(RegExp(r'[^\d+]'), '');
    final uri = Uri(scheme: 'tel', path: tel);
    if (!await canLaunchUrl(uri)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تماس با کارفرما در این دستگاه پشتیبانی نمی‌شود.')),
      );
      return;
    }
    await launchUrl(uri);
  }

  @override
  Widget build(BuildContext context) {
    final employer = _employerContact;
    final factoryGeofenceDone = widget.latitude != null && widget.longitude != null;

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(title: const Text('تأیید تحویل')),
        body: _loadingMission
            ? const Center(child: CircularProgressIndicator())
            : _loadError != null
                ? Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(_loadError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                        const SizedBox(height: 16),
                        OutlinedButton(onPressed: _loadMission, child: const Text('تلاش مجدد')),
                      ],
                    ),
                  )
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Text(
                        'مأموریت #${widget.missionId}',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 16),
                      _InfoRow(
                        icon: Icons.place_outlined,
                        label: 'آدرس مقصد',
                        value: _destinationLabel,
                      ),
                      if (employer != null && employer.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(Icons.phone_outlined, size: 20, color: MineralTheme.muted),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'تماس کارفرما',
                                    style: TextStyle(fontSize: 12, color: Colors.black.withOpacity(0.5)),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(employer, style: const TextStyle(fontWeight: FontWeight.w600)),
                                ],
                              ),
                            ),
                            TextButton.icon(
                              onPressed: _callEmployer,
                              icon: const Icon(Icons.call, size: 18),
                              label: const Text('تماس'),
                            ),
                          ],
                        ),
                      ],
                      if (factoryGeofenceDone) ...[
                        const SizedBox(height: 16),
                        Material(
                          color: MineralTheme.primary.withOpacity(0.08),
                          borderRadius: BorderRadius.circular(10),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                            child: Row(
                              children: [
                                Icon(Icons.check_circle_outline, color: MineralTheme.primary, size: 20),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    widget.distanceM != null
                                        ? 'ورود به کارخانه تأیید شد (${widget.distanceM!.round()} متر از مقصد)'
                                        : 'ورود به کارخانه تأیید شد',
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                      color: MineralTheme.primary,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 24),
                      Text(
                        'چک‌لیست تحویل',
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 8),
                      CheckboxListTile(
                        value: _unloadComplete,
                        onChanged: (v) => setState(() => _unloadComplete = v ?? false),
                        title: const Text('تخلیه کامل شد'),
                        controlAffinity: ListTileControlAffinity.leading,
                        contentPadding: EdgeInsets.zero,
                      ),
                      CheckboxListTile(
                        value: _noDiscrepancy,
                        onChanged: (v) => setState(() => _noDiscrepancy = v ?? false),
                        title: const Text('مغایرت ندارم'),
                        controlAffinity: ListTileControlAffinity.leading,
                        contentPadding: EdgeInsets.zero,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'رسید تحویل (اختیاری)',
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 8),
                      if (_receiptBytes != null) ...[
                        ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: Image.memory(_receiptBytes!, height: 140, width: double.infinity, fit: BoxFit.cover),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            OutlinedButton(onPressed: _pickReceipt, child: const Text('عکس دیگر')),
                            const SizedBox(width: 8),
                            TextButton(onPressed: _clearReceipt, child: const Text('حذف عکس')),
                          ],
                        ),
                      ] else
                        OutlinedButton.icon(
                          onPressed: _submitting ? null : _pickReceipt,
                          icon: const Icon(Icons.photo_camera_outlined),
                          label: const Text('افزودن عکس رسید'),
                        ),
                      if (_receiptError != null) ...[
                        const SizedBox(height: 8),
                        Text(_receiptError!, style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 13)),
                      ],
                      if (_locationError != null) ...[
                        const SizedBox(height: 12),
                        Text(_locationError!, style: TextStyle(color: Theme.of(context).colorScheme.error, height: 1.4)),
                      ],
                      const SizedBox(height: 24),
                      SizedBox(
                        height: 48,
                        child: FilledButton(
                          onPressed: _canConfirm && !_locating ? _confirmDelivery : null,
                          child: _submitting || _locating
                              ? const SizedBox(
                                  width: 22,
                                  height: 22,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                )
                              : const Text('تأیید تحویل'),
                        ),
                      ),
                      if (!MissionFlow.wfGeofenceEnabled) ...[
                        const SizedBox(height: 8),
                        Text(
                          'موقعیت GPS هنگام تأیید برای ثبت تحویل استفاده می‌شود.',
                          style: TextStyle(fontSize: 12, color: Colors.black.withOpacity(0.5), height: 1.4),
                        ),
                      ],
                    ],
                  ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
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
              Text(label, style: TextStyle(fontSize: 12, color: Colors.black.withOpacity(0.5))),
              const SizedBox(height: 2),
              Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ],
    );
  }
}
