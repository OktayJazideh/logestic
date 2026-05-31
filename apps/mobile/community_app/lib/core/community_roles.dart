/// Roles allowed in the community mobile app.
const Set<String> communityRoles = {
  'HOUSEHOLD',
  'COOP_OPERATOR',
  'COOP_ADMIN',
  'COOP', // legacy alias → COOP_ADMIN
  'OPERATOR',
};

String normalizeCommunityRole(String role) {
  if (role == 'COOP') return 'COOP_ADMIN';
  return role;
}

bool isCommunityRole(String role) => communityRoles.contains(role);

bool isHouseholdRole(String role) => normalizeCommunityRole(role) == 'HOUSEHOLD';

bool isCoopOperatorRole(String role) => normalizeCommunityRole(role) == 'COOP_OPERATOR';

bool isCoopAdminRole(String role) => normalizeCommunityRole(role) == 'COOP_ADMIN';

bool isCoopRole(String role) =>
    isCoopOperatorRole(role) || isCoopAdminRole(role);

bool isMineOperatorRole(String role) => normalizeCommunityRole(role) == 'OPERATOR';

String roleLabelFa(String role) {
  switch (normalizeCommunityRole(role)) {
    case 'HOUSEHOLD':
      return 'خانوار';
    case 'COOP_OPERATOR':
      return 'اپراتور تعاونی';
    case 'COOP_ADMIN':
      return 'مدیر تعاونی';
    case 'OPERATOR':
      return 'اپراتور عملیات ساعتی';
    default:
      return role;
  }
}
