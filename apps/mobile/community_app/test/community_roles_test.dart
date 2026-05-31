import 'package:flutter_test/flutter_test.dart';
import 'package:community_app/core/community_roles.dart';

void main() {
  test('legacy COOP maps to COOP_ADMIN', () {
    expect(normalizeCommunityRole('COOP'), 'COOP_ADMIN');
  });

  test('community roles gate', () {
    expect(isCommunityRole('HOUSEHOLD'), isTrue);
    expect(isCommunityRole('COOP_OPERATOR'), isTrue);
    expect(isCommunityRole('OPERATOR'), isTrue);
    expect(isMineOperatorRole('OPERATOR'), isTrue);
    expect(isCommunityRole('COOP_ADMIN'), isTrue);
    expect(isCommunityRole('DRIVER'), isFalse);
  });

  test('role helpers', () {
    expect(isHouseholdRole('HOUSEHOLD'), isTrue);
    expect(isCoopOperatorRole('COOP_OPERATOR'), isTrue);
    expect(isCoopAdminRole('COOP_ADMIN'), isTrue);
    expect(isCoopAdminRole('COOP'), isTrue);
    expect(isCoopRole('COOP_OPERATOR'), isTrue);
    expect(isCoopRole('COOP_ADMIN'), isTrue);
    expect(isCoopRole('COOP'), isTrue);
    expect(isCoopRole('HOUSEHOLD'), isFalse);
  });
}
