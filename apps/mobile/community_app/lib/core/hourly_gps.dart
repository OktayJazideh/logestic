import 'package:geolocator/geolocator.dart';

import '../models/hourly_models.dart';

/// Resolves GPS for hourly start/end (required by API).
Future<HourlyGeo> resolveHourlyGps() async {
  final enabled = await Geolocator.isLocationServiceEnabled();
  if (!enabled) {
    throw StateError('سرویس موقعیت‌یابی خاموش است.');
  }

  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }
  if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
    throw StateError('دسترسی موقعیت مکانی داده نشده است.');
  }

  final pos = await Geolocator.getCurrentPosition(
    locationSettings: const LocationSettings(
      accuracy: LocationAccuracy.high,
      timeLimit: Duration(seconds: 20),
    ),
  );
  return HourlyGeo(lat: pos.latitude, lng: pos.longitude);
}
