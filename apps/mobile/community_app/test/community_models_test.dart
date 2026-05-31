import 'package:flutter_test/flutter_test.dart';
import 'package:community_app/models/community_models.dart';

void main() {
  test('monthlySharesFromTransactions filters POOL_DISTRIBUTION', () {
    final txs = [
      WalletTransaction(id: 1, amount: 100, type: 'CREDIT'),
      WalletTransaction(
        id: 2,
        amount: 40000,
        type: 'POOL_DISTRIBUTION',
        createdAt: DateTime.utc(2026, 5, 1),
      ),
    ];
    final shares = monthlySharesFromTransactions(txs);
    expect(shares.length, 1);
    expect(shares.first.amount, 40000);
    expect(shares.first.periodKey, '2026-05');
  });

  test('HouseholdSharesView parses API payload', () {
    final view = HouseholdSharesView.fromJson({
      'period_key': '2026-06',
      'community_rial_per_ton': 500000,
      'shares': [
        {
          'source': 'POOL_DISTRIBUTION',
          'mission_id': null,
          'amount_rial': 3000000,
          'status': 'CALCULATED',
          'paid_at': null,
          'description_fa': 'توزیع استخر اجتماعی',
        },
      ],
      'total_rial': 3000000,
    });
    expect(view.shares.length, 1);
    expect(view.totalRial, 3000000);
    expect(view.shares.first.status, 'CALCULATED');
  });

  test('HouseholdWalletView.fromJson parses community rate when present', () {
    final view = HouseholdWalletView.fromJson({
      'wallet': {
        'id': 1,
        'wallet_type': 'HOUSEHOLD',
        'household_id': 2,
        'active': true,
      },
      'balance': 1000,
      'transactions': [],
      'community_rial_per_ton': 500000,
    });
    expect(view.communityRialPerTon, 500000);
  });

  test('KycInbox parses nested legacy inbox', () {
    final inbox = KycInbox.fromJson({
      'inbox': {
        'households': [
          {
            'id': 1,
            'kind': 'household',
            'label': 'تست',
            'status': 'PENDING',
            'cooperative_id': 1,
          },
        ],
      },
    });
    expect(inbox.households.length, 1);
    expect(inbox.households.first.name, 'تست');
    expect(inbox.households.first.entityType, 'household');
  });

  test('KycInboxPage parses paginated items', () {
    final page = KycInboxPage.fromJson({
      'items': [
        {
          'id': 7,
          'entity_type': 'household',
          'name': 'علی رضایی',
          'national_id': '1234567890',
          'village_id': 1,
          'village_name': 'روستای تست',
          'status': 'PENDING',
          'created_at': '2026-05-01T10:00:00.000Z',
          'cooperative_id': 1,
        },
      ],
      'total': 1,
      'page': 1,
      'limit': 20,
      'status': 'PENDING',
    });
    expect(page.items.length, 1);
    expect(page.items.first.entityType, 'household');
    expect(page.items.first.name, 'علی رضایی');
    expect(page.total, 1);
    expect(kycEntityPathSegment('driver'), 'drivers');
    expect(kycDocLinks(page.items.first), isEmpty);
  });
}
