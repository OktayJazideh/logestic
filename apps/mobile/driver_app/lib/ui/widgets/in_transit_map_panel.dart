import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:mineral_api/mineral_api.dart';

/// Route map: mine (origin) → factory (destination) with polyline (WF-INTRANSIT-1).
class InTransitMapPanel extends StatelessWidget {
  const InTransitMapPanel({
    super.key,
    required this.mineLat,
    required this.mineLng,
    required this.factoryLat,
    required this.factoryLng,
    this.height = 240,
  });

  final double mineLat;
  final double mineLng;
  final double factoryLat;
  final double factoryLng;
  final double height;

  @override
  Widget build(BuildContext context) {
    final mine = LatLng(mineLat, mineLng);
    final factory = LatLng(factoryLat, factoryLng);
    final bounds = LatLngBounds.fromPoints([mine, factory]);
    final center = bounds.center;

    final markers = <Marker>[
      Marker(
        key: const ValueKey('marker-mine'),
        point: mine,
        width: 40,
        height: 40,
        child: const Icon(Icons.landscape, color: MineralTheme.primary, size: 36),
      ),
      Marker(
        key: const ValueKey('marker-factory'),
        point: factory,
        width: 40,
        height: 40,
        child: const Icon(Icons.factory_outlined, color: MineralTheme.accent, size: 36),
      ),
    ];

    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        height: height,
        child: FlutterMap(
          options: MapOptions(
            initialCenter: center,
            initialZoom: 11,
            initialCameraFit: CameraFit.bounds(bounds: bounds, padding: const EdgeInsets.all(48)),
            interactionOptions: const InteractionOptions(flags: InteractiveFlag.all),
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.logestic.driver_app',
            ),
            PolylineLayer(
              polylines: [
                Polyline(
                  points: [mine, factory],
                  color: MineralTheme.primary,
                  strokeWidth: 4,
                ),
              ],
            ),
            MarkerLayer(markers: markers),
          ],
        ),
      ),
    );
  }
}
