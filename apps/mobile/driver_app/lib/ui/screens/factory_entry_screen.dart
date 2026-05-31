import 'package:flutter/material.dart';

import '../../core/driver_api_client.dart';
import 'geofence_entry_body.dart';

/// WF-GEOFENCE-1 — geofence at destination before unload (WF-UNLOAD) / DELIVERED.
class FactoryEntryScreen extends StatelessWidget {
  const FactoryEntryScreen({
    super.key,
    required this.api,
    required this.token,
    required this.missionId,
    this.destination,
    this.employerContact,
  });

  final DriverApiClient api;
  final String token;
  final int missionId;
  final String? destination;
  final String? employerContact;

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: GeofenceEntryBody(
        api: api,
        token: token,
        missionId: missionId,
        geofenceTarget: 'factory',
        appBarTitle: 'ورود به کارخانه',
        confirmLabel: 'تأیید ورود به کارخانه',
        popAfterConfirm: false,
        onConfirmed: (pos, distanceM) {
          Navigator.pushNamed(
            context,
            '/unload-confirm',
            arguments: {
              'missionId': missionId,
              'token': token,
              'destination': destination,
              'employer_contact': employerContact,
              'latitude': pos.latitude,
              'longitude': pos.longitude,
              'accuracy_m': pos.accuracy,
              'distance_m': distanceM,
            },
          ).then((delivered) {
            if (delivered == true && context.mounted) {
              Navigator.pop(context, true);
            }
          });
        },
      ),
    );
  }
}
