import 'package:flutter/material.dart';

import '../../mineral_theme.dart';

enum GeofenceGpsState { locating, ok, error }

/// Wireframe geofence status table (distance, inside/outside, GPS).
class GeofenceStatusTable extends StatelessWidget {
  const GeofenceStatusTable({
    super.key,
    required this.areaLabel,
    this.driverLat,
    this.driverLng,
    this.distanceM,
    this.radiusM,
    this.insideFence,
    required this.gpsState,
    this.gpsError,
  });

  final String areaLabel;
  final double? driverLat;
  final double? driverLng;
  final double? distanceM;
  final double? radiusM;
  final bool? insideFence;
  final GeofenceGpsState gpsState;
  final String? gpsError;

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
            'وضعیت موقعیت',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          _Row(label: 'محدوده مجاز', value: areaLabel),
          _Row(
            label: 'موقعیت راننده',
            value: driverLat != null && driverLng != null
                ? '${driverLat!.toStringAsFixed(5)}, ${driverLng!.toStringAsFixed(5)}'
                : '—',
          ),
          if (distanceM != null && radiusM != null) ...[
            _Row(label: 'فاصله', value: '${distanceM!.round()} متر'),
            _Row(label: 'شعاع مجاز', value: '${radiusM!.round()} متر'),
          ],
          if (insideFence != null)
            _Row(
              label: 'وضعیت',
              value: insideFence! ? 'داخل محدوده' : 'خارج محدوده',
              valueColor: insideFence! ? MineralTheme.primary : MineralTheme.danger,
            ),
          _Row(label: 'GPS', value: _gpsLabel(), valueColor: _gpsColor()),
          if (gpsError != null && gpsState == GeofenceGpsState.error)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(gpsError!, style: const TextStyle(fontSize: 12, color: MineralTheme.danger, height: 1.4)),
            ),
        ],
      ),
    );
  }

  String _gpsLabel() {
    switch (gpsState) {
      case GeofenceGpsState.locating:
        return 'در حال دریافت…';
      case GeofenceGpsState.ok:
        return 'فعال';
      case GeofenceGpsState.error:
        return 'خطا';
    }
  }

  Color _gpsColor() {
    switch (gpsState) {
      case GeofenceGpsState.locating:
        return MineralTheme.muted;
      case GeofenceGpsState.ok:
        return MineralTheme.primary;
      case GeofenceGpsState.error:
        return MineralTheme.danger;
    }
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value, this.valueColor});

  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 2,
            child: Text(label, style: const TextStyle(fontSize: 13, color: MineralTheme.muted)),
          ),
          Expanded(
            flex: 3,
            child: Text(
              value,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: valueColor ?? MineralTheme.primaryDark,
              ),
              textAlign: TextAlign.left,
            ),
          ),
        ],
      ),
    );
  }
}
