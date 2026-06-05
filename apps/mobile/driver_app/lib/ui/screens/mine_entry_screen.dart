import 'package:flutter/material.dart';

import 'package:mineral_api/mineral_api.dart';

import '../../core/driver_api_client.dart';
import '../../core/driver_logout.dart';
import 'geofence_entry_body.dart';

/// WF-GEOFENCE-1 — geofence validation before ACCEPTED → ARRIVED.
class MineEntryScreen extends StatelessWidget {
  const MineEntryScreen({
    super.key,
    required this.api,
    required this.token,
    required this.missionId,
    required this.sessionStore,
  });

  final DriverApiClient api;
  final String token;
  final int missionId;
  final SessionStore sessionStore;

  @override
  Widget build(BuildContext context) {
    return GeofenceEntryBody(
      api: api,
      token: token,
      missionId: missionId,
      geofenceTarget: 'mine',
      advanceStep: 'ARRIVED',
      appBarTitle: 'ورود به معدن',
      onConfirmed: (_, __) {},
      confirmLabel: 'تأیید ورود به معدن',
      onLogout: () => driverLogout(context, sessionStore),
    );
  }
}
