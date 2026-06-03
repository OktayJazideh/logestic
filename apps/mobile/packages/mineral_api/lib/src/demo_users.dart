/// Demo personas — keep in sync with apps/backend/scripts/seed.ts + apps/web/src/demo/demoUsers.ts

class DemoWorkspace {
  const DemoWorkspace({
    required this.mineId,
    required this.membershipKind,
    this.cooperativeId,
  });

  final int mineId;
  final String membershipKind; // OPERATIONAL | COMMUNITY
  final int? cooperativeId;
}

class DemoPersona {
  const DemoPersona({
    required this.id,
    required this.roleLabel,
    required this.mobile,
    required this.apps,
    required this.workspaceHint,
    required this.flowHint,
    this.workspace,
  });

  final String id;
  final String roleLabel;
  final String mobile;
  final List<String> apps; // web | driver | community
  final String workspaceHint;
  final String flowHint;
  final DemoWorkspace? workspace;
}

const _mine1Op = DemoWorkspace(mineId: 1, membershipKind: 'OPERATIONAL');
const _mine1Community = DemoWorkspace(
  mineId: 1,
  membershipKind: 'COMMUNITY',
  cooperativeId: 1,
);

const demoPersonas = <DemoPersona>[
  DemoPersona(
    id: 'admin',
    roleLabel: 'ادمین پلتفرم',
    mobile: '09000000000',
    apps: ['web'],
    workspaceHint: 'کار عملیاتی · معدن ۱',
    flowHint: 'صورت وضعیت و پرداخت معدن',
    workspace: _mine1Op,
  ),
  DemoPersona(
    id: 'employer',
    roleLabel: 'کارفرما / معدن',
    mobile: '09000000007',
    apps: ['web'],
    workspaceHint: 'کار عملیاتی · معدن ۱',
    flowHint: 'ثبت نیاز حمل',
    workspace: _mine1Op,
  ),
  DemoPersona(
    id: 'ops_admin',
    roleLabel: 'مدیر عملیات',
    mobile: '09000000002',
    apps: ['web'],
    workspaceHint: 'کار عملیاتی · معدن ۱',
    flowHint: 'تخصیص و تأیید باسکول',
    workspace: _mine1Op,
  ),
  DemoPersona(
    id: 'coop_op',
    roleLabel: 'اپراتور باسکول',
    mobile: '09000000111',
    apps: ['web'],
    workspaceHint: 'عضویت تعاونی · معدن ۱',
    flowHint: 'ثبت و تأیید وزن باسکول',
    workspace: _mine1Community,
  ),
  DemoPersona(
    id: 'coop_admin',
    roleLabel: 'مدیر تعاونی',
    mobile: '09000000001',
    apps: ['web', 'community'],
    workspaceHint: 'عضویت تعاونی · معدن ۱',
    flowHint: 'احراز هویت و صورت وضعیت',
    workspace: _mine1Community,
  ),
  DemoPersona(
    id: 'driver',
    roleLabel: 'راننده',
    mobile: '09000000003',
    apps: ['driver'],
    workspaceHint: 'کار عملیاتی · معدن ۱',
    flowHint: 'مأموریت تا تحویل (بدون ثبت وزن)',
    workspace: _mine1Op,
  ),
  DemoPersona(
    id: 'fleet',
    roleLabel: 'مالک ناوگان',
    mobile: '09000000004',
    apps: ['web'],
    workspaceHint: 'کار عملیاتی · معدن ۱',
    flowHint: 'کیف پول و ناوگان',
    workspace: _mine1Op,
  ),
  DemoPersona(
    id: 'household_pending',
    roleLabel: 'خانوار (در انتظار KYC)',
    mobile: '09000000005',
    apps: ['community'],
    workspaceHint: 'عضویت تعاونی · معدن ۱',
    flowHint: 'ثبت‌نام در اپ تعاونی',
    workspace: _mine1Community,
  ),
  DemoPersona(
    id: 'household_ok',
    roleLabel: 'خانوار (تأییدشده)',
    mobile: '09000001001',
    apps: ['community'],
    workspaceHint: 'عضویت تعاونی · معدن ۱',
    flowHint: 'سهم و کیف پول',
    workspace: _mine1Community,
  ),
  DemoPersona(
    id: 'consultant',
    roleLabel: 'مشاور ساعتی',
    mobile: '09000000006',
    apps: ['web'],
    workspaceHint: 'کار عملیاتی · معدن ۱',
    flowHint: 'تأیید کارکرد ساعتی',
    workspace: _mine1Op,
  ),
  DemoPersona(
    id: 'operator',
    roleLabel: 'اپراتور ساعتی',
    mobile: '09000000008',
    apps: ['community'],
    workspaceHint: 'کار عملیاتی · معدن ۱',
    flowHint: 'کار ساعتی',
    workspace: _mine1Op,
  ),
];

List<DemoPersona> demoPersonasForApp(String app) =>
    demoPersonas.where((p) => p.apps.contains(app)).toList();

/// Primary one-tap demo persona per mobile app (→ dashboard / home).
DemoPersona? primaryDemoPersonaForApp(String app) {
  const primaryIds = {'driver': 'driver', 'community': 'household_ok'};
  final id = primaryIds[app];
  if (id == null) return null;
  for (final p in demoPersonas) {
    if (p.id == id) return p;
  }
  return null;
}
