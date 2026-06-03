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
    id: 'admin',
    roleLabel: 'ادمین پلتفرم',
    mobile: '09000000000',
    apps: ['web'],
    workspaceHint: 'OPERATIONAL · معدن ۱',
    flowHint: 'پنل ادمین',
  ),
  DemoPersona(
    id: 'employer',
    roleLabel: 'کارفرما / معدن',
    mobile: '09000000007',
    apps: ['web'],
    workspaceHint: 'OPERATIONAL · معدن ۱',
    flowHint: 'ثبت نیاز حمل',
  ),
  DemoPersona(
    id: 'ops_admin',
    roleLabel: 'مدیر عملیات',
    mobile: '09000000002',
    apps: ['web'],
    workspaceHint: 'OPERATIONAL · معدن ۱',
    flowHint: 'dispatch، باسکول',
  ),
  DemoPersona(
    id: 'coop_op',
    roleLabel: 'اپراتور باسکول',
    mobile: '09000000111',
    apps: ['web', 'community'],
    workspaceHint: 'OPERATIONAL · معدن ۱',
    flowHint: 'ثبت وزن',
  ),
  DemoPersona(
    id: 'coop_admin',
    roleLabel: 'مدیر تعاونی',
    mobile: '09000000001',
    apps: ['web', 'community'],
    workspaceHint: 'COMMUNITY · معدن ۱',
    flowHint: 'KYC، اعضا',
  ),
  DemoPersona(
    id: 'fleet',
    roleLabel: 'مالک ناوگان',
    mobile: '09000000004',
    apps: ['web'],
    workspaceHint: 'OPERATIONAL · معدن ۱',
    flowHint: 'ناوگان',
  ),
  DemoPersona(
    id: 'consultant',
    roleLabel: 'مشاور ساعتی',
    mobile: '09000000006',
    apps: ['web'],
    workspaceHint: 'OPERATIONAL · معدن ۱',
    flowHint: 'کار ساعتی',
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
  DemoPersona(
    id: 'operator',
    roleLabel: 'اپراتور ساعتی',
    mobile: '09000000008',
    apps: ['community'],
    workspaceHint: 'OPERATIONAL · معدن ۱',
    flowHint: 'کار ساعتی',
  ),
];

List<DemoPersona> demoPersonasForApp(String app) =>
    demoPersonas.where((p) => p.apps.contains(app)).toList();
