import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

import 'community_api_client.dart';
import 'community_roles.dart';

/// After operational workspace select — route OPERATOR to hourly flow.
Future<void> navigateAfterWorkspace({
  required BuildContext context,
  required CommunityApiClient api,
  required String token,
  required String role,
}) async {
  if (isMineOperatorRole(role)) {
    if (!context.mounted) return;
    Navigator.pushReplacementNamed(
      context,
      '/hourly/start',
      arguments: {'token': token, 'role': normalizeCommunityRole(role)},
    );
    return;
  }

  // Household / coop paths
  await navigateHouseholdOrCoopHome(
    context: context,
    api: api,
    token: token,
    role: role,
  );
}

Future<void> navigateHouseholdOrCoopHome({
  required BuildContext context,
  required CommunityApiClient api,
  required String token,
  required String role,
}) async {
  if (!isHouseholdRole(role)) {
    if (!context.mounted) return;
    Navigator.pushReplacementNamed(
      context,
      '/home',
      arguments: {'token': token, 'role': role},
    );
    return;
  }

  final profile = await api.getHouseholdMe(token: token);
  if (!context.mounted) return;
  if (profile == null) {
    Navigator.pushReplacementNamed(
      context,
      '/register',
      arguments: {'token': token, 'role': role},
    );
    return;
  }
  Navigator.pushReplacementNamed(
    context,
    '/home',
    arguments: {'token': token, 'role': role},
  );
}
