import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:mineral_api/mineral_api.dart';
import 'package:mineral_ui/mineral_ui.dart';

import '../../core/connectivity_service.dart';
import '../../core/driver_api_client.dart';
import '../../core/geofence_math.dart';
import '../../core/offline/mission_step_queue_item.dart';
import '../../core/offline/mission_step_queue_store.dart';
import '../../models/geofence_config.dart';
import '../widgets/geofence_map_panel.dart';

/// Shared geofence entry UI for mine (→ ARRIVED) and factory (→ unload flow).
class GeofenceEntryBody extends StatefulWidget {
  const GeofenceEntryBody({
    super.key,
    required this.api,
    required this.token,
    required this.missionId,
    required this.geofenceTarget,
    this.advanceStep,
    required this.confirmLabel,
    required this.appBarTitle,
    this.onConfirmed,
    this.popAfterConfirm = true,
    this.queueStore,
    this.connectivity,
    this.onLogout,
  });

  final DriverApiClient api;
  final String token;
  final int missionId;
  final String geofenceTarget;
  /// When set, POST mission step advance (e.g. `ARRIVED` for mine entry).
  final String? advanceStep;
  final String confirmLabel;
  final String appBarTitle;
  final void Function(Position position, double? distanceM)? onConfirmed;
  /// When false, caller handles navigation after [onConfirmed] (e.g. factory → unload).
  final bool popAfterConfirm;
  final MissionStepQueueStore? queueStore;
  final ConnectivityService? connectivity;
  final Future<void> Function()? onLogout;

  @override
  State<GeofenceEntryBody> createState() => _GeofenceEntryBodyState();
}

class _GeofenceEntryBodyState extends State<GeofenceEntryBody> {
  late final MissionStepQueueStore _queueStore;
  late final ConnectivityService _connectivity;

  GeofenceConfig? _config;
  bool _loadingConfig = true;
  String? _configError;

  bool _locating = false;
  String? _locationError;
  Position? _position;
  double? _distanceM;
  bool _insideFence = false;
  bool _submitting = false;

  StreamSubscription<Position>? _positionSub;

  @override
  void initState() {
    super.initState();
    _queueStore = widget.queueStore ?? MissionStepQueueStore();
    _connectivity = widget.connectivity ?? ConnectivityService();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    await _queueStore.init();
    _connectivity.start();
    await _loadConfig();
    await _startLocation();
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    if (widget.connectivity == null) {
      _connectivity.dispose();
    }
    super.dispose();
  }

  Future<void> _loadConfig() async {
    setState(() {
      _loadingConfig = true;
      _configError = null;
    });
    try {
      final config = await widget.api.getMissionGeofence(
        token: widget.token,
        missionId: widget.missionId,
        target: widget.geofenceTarget,
      );
      if (!mounted) return;
      setState(() {
        _config = config;
        _loadingConfig = false;
      });
      _recalcDistance();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _configError = e.toString();
        _loadingConfig = false;
      });
    }
  }

  Future<void> _startLocation() async {
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
        setState(() {
          _locationError = 'دسترسی به موقعیت مکانی داده نشد. GPS را در تنظیمات فعال کنید.';
          _locating = false;
        });
        return;
      }

      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        setState(() {
          _locationError = 'سرویس موقعیت‌یاب (GPS) خاموش است.';
          _locating = false;
        });
        return;
      }

      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      _applyPosition(pos);

      _positionSub?.cancel();
      _positionSub = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 5,
        ),
      ).listen(_applyPosition);
    } catch (e) {
      setState(() {
        _locationError = 'خطا در دریافت موقعیت GPS: $e';
        _locating = false;
      });
    }
  }

  void _applyPosition(Position pos) {
    setState(() {
      _position = pos;
      _locating = false;
    });
    _recalcDistance();
  }

  void _recalcDistance() {
    final cfg = _config;
    final pos = _position;
    if (cfg == null || pos == null) return;
    final d = haversineDistanceMeters(pos.latitude, pos.longitude, cfg.lat, cfg.lng);
    setState(() {
      _distanceM = d;
      _insideFence = d <= cfg.radiusM;
    });
  }

  Future<void> _confirm() async {
    final cfg = _config;
    final pos = _position;
    if (cfg == null || pos == null || !_insideFence) return;

    final step = widget.advanceStep;
    if (step == null) {
      widget.onConfirmed?.call(pos, _distanceM);
      if (widget.popAfterConfirm && mounted) Navigator.pop(context, true);
      return;
    }

    setState(() => _submitting = true);
    try {
      final online = await _connectivity.isOnline;
      if (!online) {
        await _enqueueOffline(pos, step);
        if (!mounted) return;
        widget.onConfirmed?.call(pos, _distanceM);
        Navigator.pop(context, true);
        return;
      }

      await widget.api.advanceMission(
        token: widget.token,
        missionId: widget.missionId,
        step: step,
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracyM: pos.accuracy,
        distanceM: _distanceM,
        idempotencyKey: MineralApiClient.newIdempotencyKey(),
      );
      if (!mounted) return;
      widget.onConfirmed?.call(pos, _distanceM);
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isNetworkError) {
        await _enqueueOffline(pos, step);
        widget.onConfirmed?.call(pos, _distanceM);
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

  Future<void> _enqueueOffline(Position pos, String step) async {
    final item = MissionStepQueueItem(
      id: MineralApiClient.newIdempotencyKey(),
      missionId: widget.missionId,
      step: step,
      previousStatus: step == 'ARRIVED' ? 'ACCEPTED' : 'IN_TRANSIT',
      createdAt: DateTime.now().toUtc(),
      latitude: pos.latitude,
      longitude: pos.longitude,
      accuracyM: pos.accuracy,
      distanceM: _distanceM,
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

  @override
  Widget build(BuildContext context) {
    final cfg = _config;
    final canConfirm = cfg != null && _position != null && _insideFence && !_submitting && !_loadingConfig;

    final distanceHero = _distanceM != null
        ? 'فاصله شما: ${_distanceM!.round()} متر'
        : (_locating ? 'در حال محاسبه فاصله…' : 'موقعیت شما هنوز مشخص نیست');

    final statusTone = _insideFence
        ? SimpleStatusTone.success
        : (_distanceM != null ? SimpleStatusTone.warn : SimpleStatusTone.info);

    return Directionality(
      textDirection: TextDirection.rtl,
      child: SimpleScaffold(
        title: widget.appBarTitle,
        onLogout: widget.onLogout,
        status: cfg != null
            ? SimpleStatusCard(
                message: _insideFence
                    ? 'داخل ${simpleLabel('geofence')} هستید — می‌توانید تأیید کنید.'
                    : 'به ${simpleLabel('geofence')} نزدیک شوید.',
                icon: _insideFence ? Icons.check_circle_outline : Icons.near_me_outlined,
                tone: statusTone,
              )
            : null,
        bottomBar: cfg != null
            ? BigActionButton(
                label: widget.confirmLabel,
                busy: _submitting,
                onPressed: canConfirm ? _confirm : null,
              )
            : null,
        body: _loadingConfig && cfg == null
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_configError != null) ...[
                    PlainLanguageError(
                      message: _configError!,
                      whatToDo: 'اتصال را بررسی کنید و دوباره تلاش کنید.',
                      onRetry: _loadConfig,
                    ),
                    const SizedBox(height: 16),
                  ],
                  if (cfg != null) ...[
                    Text(
                      distanceHero,
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: MineralTheme.primaryDark,
                          ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${cfg.label} · مأموریت #${widget.missionId}',
                      style: const TextStyle(color: MineralTheme.muted, fontSize: 14),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    GeofenceStatusTable(
                      areaLabel: cfg.label,
                      driverLat: _position?.latitude,
                      driverLng: _position?.longitude,
                      distanceM: _distanceM,
                      radiusM: cfg.radiusM,
                      insideFence: _position != null && _distanceM != null ? _insideFence : null,
                      gpsState: _locating
                          ? GeofenceGpsState.locating
                          : (_locationError != null ? GeofenceGpsState.error : GeofenceGpsState.ok),
                      gpsError: _locationError,
                    ),
                    if (_position != null && _distanceM != null && !_insideFence) ...[
                      const SizedBox(height: 10),
                      const PlainLanguageError(
                        message: 'هنوز داخل محدوده نیستید.',
                        whatToDo: 'به سمت محدوده حرکت کنید تا دکمه تأیید فعال شود.',
                      ),
                    ],
                    const SizedBox(height: 12),
                    ExpansionTile(
                      title: const Text('نمایش نقشه (اختیاری)'),
                      children: [
                        GeofenceMapPanel(
                          config: cfg,
                          driverPosition:
                              _position != null ? LatLng(_position!.latitude, _position!.longitude) : null,
                        ),
                      ],
                    ),
                  ],
                ],
              ),
      ),
    );
  }
}
