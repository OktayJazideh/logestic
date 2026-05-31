import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:mineral_api/mineral_api.dart';

import '../../models/geofence_config.dart';

/// Map centered on geofence target with mine/factory marker.
class GeofenceMapPanel extends StatelessWidget {
  const GeofenceMapPanel({
    super.key,
    required this.config,
    this.driverPosition,
    this.height = 220,
  });

  final GeofenceConfig config;
  final LatLng? driverPosition;
  final double height;

  @override
  Widget build(BuildContext context) {
    final center = LatLng(config.lat, config.lng);
    final markers = <Marker>[
      Marker(
        point: center,
        width: 40,
        height: 40,
        child: Icon(
          config.target == 'mine' ? Icons.landscape : Icons.factory_outlined,
          color: MineralTheme.primary,
          size: 36,
        ),
      ),
      if (driverPosition != null)
        Marker(
          point: driverPosition!,
          width: 28,
          height: 28,
          child: const Icon(Icons.my_location, color: MineralTheme.primary, size: 28),
        ),
    ];

    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        height: height,
        child: FlutterMap(
          options: MapOptions(
            initialCenter: driverPosition ?? center,
            initialZoom: 14,
            interactionOptions: const InteractionOptions(flags: InteractiveFlag.all),
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.logestic.driver_app',
            ),
            MarkerLayer(markers: markers),
          ],
        ),
      ),
    );
  }
}
