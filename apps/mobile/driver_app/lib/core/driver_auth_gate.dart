import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

import 'driver_api_client.dart';

/// Routes driver after OTP verify or app resume — never skips KYC to home.
Future<void> navigateAfterDriverAuth({
  required BuildContext context,
  required DriverApiClient api,
  required String token,
  required SessionStore sessionStore,
}) async {
  final me = await api.getDriverMe(token: token);
  if (!context.mounted) return;

  if (me.isSuspended) {
    Navigator.pushNamedAndRemoveUntil(
      context,
      '/suspended',
      (_) => false,
      arguments: token,
    );
    return;
  }

  if (me.isPending) {
    Navigator.pushNamedAndRemoveUntil(
      context,
      '/kyc-pending',
      (_) => false,
      arguments: token,
    );
    return;
  }

  if (!me.isApproved) {
    Navigator.pushNamedAndRemoveUntil(
      context,
      '/suspended',
      (_) => false,
      arguments: token,
    );
    return;
  }

  final mineId = await sessionStore.readMineId();
  if (mineId != null) {
    await api.selectWorkspace(
      token: token,
      mineId: mineId,
      membershipKind: 'OPERATIONAL',
    );
    if (!context.mounted) return;
    Navigator.pushReplacementNamed(context, '/home', arguments: token);
    return;
  }

  final workspaces = (await api.getWorkspaces(token: token)).where((w) => w.isOperational).toList();
  if (!context.mounted) return;

  if (workspaces.length > 1) {
    Navigator.pushReplacementNamed(context, '/mine-select', arguments: token);
    return;
  }

  if (workspaces.length == 1) {
    await api.selectWorkspace(
      token: token,
      mineId: workspaces.first.mineId,
      membershipKind: 'OPERATIONAL',
    );
    await sessionStore.saveMineId(workspaces.first.mineId);
    if (!context.mounted) return;
    Navigator.pushReplacementNamed(context, '/home', arguments: token);
    return;
  }

  Navigator.pushReplacementNamed(context, '/mine-select', arguments: token);
}
