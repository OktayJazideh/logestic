import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

Future<void> driverLogout(BuildContext context, SessionStore sessionStore) async {
  await sessionStore.clearSession();
  if (!context.mounted) return;
  Navigator.pushNamedAndRemoveUntil(context, '/login', (_) => false);
}
