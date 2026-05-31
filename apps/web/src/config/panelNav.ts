export type NavItem = {
  to: string;
  label: string;
  permission?: string;
  permissions?: string[];
  end?: boolean;
};

/** Catalog: item visible when user has any listed permission (or always if omitted). */
export const PANEL_NAV: NavItem[] = [
  { to: "/panel/ops", label: "داشبورد عملیاتی", permissions: ["ops:*", "users:manage"] },
  { to: "/panel", label: "خانه", end: true },
  { to: "/panel/coop", label: "درخواست‌ها (تعاونی)", permission: "coop:manage" },
  { to: "/panel/employer", label: "نیاز کارفرما", permission: "needs:create" },
  { to: "/panel/employer/inbox", label: "دفترچه نیاز کارفرما", permissions: ["needs:read_own", "ops:*", "users:manage"] },
  { to: "/panel/dispatch-board", label: "بورد تخصیص", permission: "dispatch:create" },
  { to: "/panel/missions", label: "بورد ماموریت", permissions: ["dispatch:create", "members:read"] },
  { to: "/panel/rate-cards", label: "کارت نرخ", permissions: ["coop:manage", "settlement:execute"] },
  { to: "/panel/weighbridge", label: "باسکول", permission: "weighbridge:submit" },
  { to: "/panel/payments", label: "کنترل HOLD/Release", permission: "hold:create" },
  { to: "/panel/consultant/hourly", label: "کارکرد ساعتی", permission: "hourly:verify" },
  { to: "/panel/settlement", label: "Settlement Batch / Pool", permission: "settlement:read" },
  {
    to: "/panel/approvals",
    label: "صندوق تأییدها",
    permissions: ["coop:manage", "settlement:approve"],
  },
  { to: "/panel/kyc", label: "صندوق KYC", permissions: ["kyc:approve", "kyc:review"] },
  { to: "/panel/members", label: "شفافیت اعضا / اعتراض", permission: "members:read" },
  { to: "/panel/wallet", label: "کیف پول", permission: "wallet:read_own" },
  { to: "/panel/fleet-owner", label: "داشبورد مالک ناوگان", permission: "vehicles:read_own" },
  { to: "/panel/admin/users", label: "مدیریت نقش‌ها (ADMIN)", permission: "users:manage" },
  { to: "/panel/admin/rules", label: "Rule Engine (ADMIN)", permission: "users:manage" },
  { to: "/panel/admin/jobs", label: "مانیتور Jobها (QUEUE-1)", permissions: ["settlement:execute", "ops:*"] },
  { to: "/panel/admin/reconciliation", label: "تطبیق شبانه (RECON-1)", permission: "users:manage" },
  { to: "/panel/admin/audit", label: "مرور Audit (AUDIT-1)", permission: "audit:read" },
  { to: "/panel/admin/finance", label: "داشبورد مالی (FIN-UI-1)", permission: "users:manage" },
  {
    to: "/panel/admin/period-statement",
    label: "صورت وضعیت دوره (INVOICE-DRAFT)",
    permissions: ["users:manage", "settlement:read", "coop:manage"],
  },
  { to: "/panel/admin/kpi", label: "داشبورد KPI (KPI-1)", permissions: ["settlement:execute", "ops:*"] },
];

export function navItemAllowed(item: NavItem, can: (required: string | string[]) => boolean): boolean {
  if (!item.permission && !item.permissions) return true;
  const required = item.permissions ?? (item.permission ? [item.permission] : []);
  return can(required);
}

/** CONSULT-UI-1: consultant sees only hourly inbox in sidebar (logout is header button). */
export function navForRole(
  nav: NavItem[],
  role: string | undefined,
  can: (required: string | string[]) => boolean,
): NavItem[] {
  const allowed = nav.filter((item) => navItemAllowed(item, can));
  if (role === "CONSULTANT") {
    return allowed.filter((item) => item.to === "/panel/consultant/hourly");
  }
  return allowed;
}
