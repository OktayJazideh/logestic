import 'dart:convert';

import 'package:community_app/core/community_api_client.dart';
import 'package:community_app/ui/screens/coop/kyc_inbox_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mineral_api/mineral_api.dart';

Map<String, dynamic> _okEnvelope(Map<String, dynamic> data) => {
      'success': true,
      'data': data,
    };

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('CommunityApiClient KYC', () {
    test('getKycInboxPage requests paginated inbox', () async {
      final requests = <String>[];
      final client = CommunityApiClient(
        baseUrl: 'http://test',
        httpClient: MockClient((request) async {
          requests.add(request.url.toString());
          return http.Response(
            jsonEncode(
              _okEnvelope({
                'items': [],
                'total': 0,
                'page': 1,
                'limit': 20,
                'status': 'PENDING',
              }),
            ),
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final page = await client.getKycInboxPage(
        token: 'tok',
        status: 'PENDING',
        page: 2,
        limit: 20,
      );

      expect(page.items, isEmpty);
      expect(requests.single, contains('/api/coop/kyc/inbox'));
      expect(requests.single, contains('status=PENDING'));
      expect(requests.single, contains('page=2'));
      expect(requests.single, contains('limit=20'));
    });

    test('approveKycEntity posts to entity segment', () async {
      String? path;
      final client = CommunityApiClient(
        baseUrl: 'http://test',
        httpClient: MockClient((request) async {
          path = request.url.path;
          return http.Response(
            jsonEncode(_okEnvelope({'household': {'id': 7, 'status': 'APPROVED'}})),
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      await client.approveKycEntity(
        token: 'tok',
        entityType: 'household',
        id: 7,
      );

      expect(path, '/api/coop/households/7/approve');
    });
  });

  group('KycInboxScreen', () {
    testWidgets('approve household from detail sheet', (tester) async {
      var inboxCalls = 0;
      var approveCalled = false;

      final client = CommunityApiClient(
        baseUrl: 'http://test',
        httpClient: MockClient((request) async {
          final path = request.url.path;
          if (path.contains('/kyc/inbox')) {
            inboxCalls++;
            return http.Response(
              jsonEncode(
                _okEnvelope({
                  'items': [
                    {
                      'id': 7,
                      'entity_type': 'household',
                      'name': 'خانوار تست',
                      'national_id': '1234567890',
                      'village_id': 1,
                      'village_name': 'روستا',
                      'status': 'PENDING',
                      'created_at': '2026-05-01T10:00:00.000Z',
                      'cooperative_id': 1,
                    },
                  ],
                  'total': 1,
                  'page': 1,
                  'limit': 20,
                  'status': 'PENDING',
                }),
              ),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (path.endsWith('/approve')) {
            approveCalled = true;
            return http.Response(
              jsonEncode(_okEnvelope({'household': {'id': 7, 'status': 'APPROVED'}})),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response(
            jsonEncode({'success': false, 'error': {'message': 'unexpected $path'}}),
            404,
          );
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: MineralTheme.lightTheme,
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(
              body: KycInboxScreen(
                api: client,
                token: 'tok',
                onUnauthorized: () {},
              ),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('خانوار تست'), findsOneWidget);

      await tester.tap(find.text('خانوار تست'));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('kyc_sheet_approve')), findsOneWidget);

      await tester.tap(find.byKey(const Key('kyc_sheet_approve')));
      await tester.pumpAndSettle();

      await tester.tap(find.text('تأیید').last);
      await tester.pumpAndSettle(const Duration(seconds: 2));

      expect(approveCalled, isTrue);
      expect(inboxCalls, greaterThanOrEqualTo(1));
      expect(find.textContaining('تأیید شد'), findsOneWidget);
    });
  });
}
