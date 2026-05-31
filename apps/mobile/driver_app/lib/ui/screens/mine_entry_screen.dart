import 'package:flutter/material.dart';

import '../../core/driver_api_client.dart';
import 'geofence_entry_body.dart';

/// WF-GEOFENCE-1 — geofence validation before ACCEPTED → ARRIVED.
class MineEntryScreen extends StatelessWidget {
  const MineEntryScreen({
    super.key,
    required this.api,
    required this.token,
    required this.missionId,
  });

  final DriverApiClient api;
  final String token;
  final int missionId;

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: GeofenceEntryBody(
        api: api,
        token: token,
        missionId: missionId,
        geofenceTarget: 'mine',
        advanceStep: 'ARRIVED',
        appBarTitle: 'ورود به معدن',
        onConfirmed: (_, __) {},
        confirmLabel: 'تأیید ورود به معدن',
      ),
    );
  }
}
