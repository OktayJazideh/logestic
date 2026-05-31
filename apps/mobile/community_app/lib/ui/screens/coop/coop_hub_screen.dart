import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

import '../../../core/community_api_client.dart';
import 'kyc_inbox_screen.dart';
import 'members_screen.dart';

/// Cooperative hub: KYC inbox + members (COOP_OPERATOR / COOP_ADMIN).
class CoopHubScreen extends StatelessWidget {
  const CoopHubScreen({
    super.key,
    required this.api,
    required this.token,
    required this.onUnauthorized,
  });

  final CommunityApiClient api;
  final String token;
  final VoidCallback onUnauthorized;

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Material(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            child: const TabBar(
              labelColor: MineralTheme.primary,
              tabs: [
                Tab(text: 'صندوق KYC'),
                Tab(text: 'اعضا'),
              ],
            ),
          ),
          Expanded(
            child: TabBarView(
              children: [
                KycInboxScreen(
                  api: api,
                  token: token,
                  onUnauthorized: onUnauthorized,
                ),
                MembersScreen(
                  api: api,
                  token: token,
                  onUnauthorized: onUnauthorized,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
