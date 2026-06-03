/// Demo personas — keep in sync with apps/backend/scripts/seed.ts + apps/web/src/demo/demoUsers.ts

class DemoPersona {
  const DemoPersona({
    required this.id,
    required this.roleLabel,
    required this.mobile,
    required this.apps,
    required this.workspaceHint,
    required this.flowHint,
  });

  final String id;
  final String roleLabel;
  final String mobile;
  final List<String> apps; // web | driver | community
  final String workspaceHint;
  final String flowHint;
}

const demoPersonas = <DemoPersona>[
  DemoPersona(
    id: 'coop_admin',
    roleLabel: 'مدیر تعاونی',
    mobile: '09000000001',
    apps: ['web', 'community'],
    workspaceHint: 'COMMUNITY · معدن ۱',
    flowHint: 'KYC، اعضا',
  ),
  DemoPersona(
    id: 'driver',
    roleLabel: 'راننده',
    mobile: '09000000003',
    apps: ['driver'],
    workspaceHint: 'OPERATIONAL · معدن ۱',
    flowHint: 'مأموریت تا تحویل',
  ),
  DemoPersona(
    id: 'household_pending',
    roleLabel: 'خانوار (در انتظار)',
    mobile: '09000000005',
    apps: ['community'],
    workspaceHint: 'COMMUNITY · معدن ۱',
    flowHint: 'ثبت‌نام',
  ),
  DemoPersona(
    id: 'household_ok',
    roleLabel: 'خانوار (تأیید)',
    mobile: '09000001001',
    apps: ['community'],
    workspaceHint: 'COMMUNITY · معدن ۱',
    flowHint: 'سهم / کیف پول',
  ),
];

List<DemoPersona> demoPersonasForApp(String app) =>
    demoPersonas.where((p) => p.apps.contains(app)).toList();
