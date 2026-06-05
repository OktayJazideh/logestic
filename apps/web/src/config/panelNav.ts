import { roleHomeFor } from "../lib/roleHome";

export type NavItem = {
  to: string;
  label: string;
  permission?: string;
  permissions?: string[];
  end?: boolean;
};

const MAX_PRIMARY_NAV = 5;

/** Catalog: item visible when user has any listed permission (or always if omitted). */
export const PANEL_NAV: NavItem[] = [
  { to: "/panel", label: "خانه", end: true },
  { to: "/panel/ops", label: "داشبورد عملیاتی", permissions: ["ops:*", "users:manage"] },
  { to: "/panel/weighbridge", label: "باسکول", permission: "weighbridge:submit" },
  { to: "/panel/dispatch-board", label: "تخصیص بار", permission: "dispatch:create" },
  { to: "/panel/employer", label: "ثبت نیاز", permission: "needs:create" },
  { to: "/panel/employer/inbox", label: "پیگیری نیازها", permissions: ["needs:read_own", "ops:*", "users:manage"] },
  { to: "/panel/kyc", label: "تأیید هویت", permissions: ["kyc:approve", "kyc:review"] },
  { to: "/panel/settlement", label: "تسویه", permission: "settlement:read" },
  { to: "/panel/approvals", label: "صندوق تأییدها", permissions: ["coop:manage", "settlement:approve"] },
  { to: "/panel/admin/finance", label: "داشبورد مالی", permission: "users:manage" },
  { to: "/panel/admin/users", label: "مدیریت کاربران", permission: "users:manage" },
  { to: "/panel/admin/user-requests", label: "درخواست‌های کاربر", permission: "users:manage" },
  { to: "/panel/user-requests", label: "ثبت کاربر جدید", permission: "users:request" },
  { to: "/panel/coop", label: "درخواست‌های تعاونی", permission: "coop:manage" },
  { to: "/panel/missions", label: "بورد مأموریت", permissions: ["dispatch:create", "members:read"] },
  { to: "/panel/rate-cards", label: "کارت نرخ", permissions: ["coop:manage", "settlement:execute"] },
  { to: "/panel/payments", label: "نگهداری پرداخت", permission: "hold:create" },
  { to: "/panel/consultant/hourly", label: "کارکرد ساعتی", permission: "hourly:verify" },
  { to: "/panel/members", label: "شفافیت اعضا", permission: "members:read" },
  { to: "/panel/wallet", label: "کیف پول", permission: "wallet:read_own" },
  { to: "/panel/fleet-owner", label: "مالک ناوگان", permission: "vehicles:read_own" },
  { to: "/panel/admin/rules", label: "قوانین سیستم", permission: "users:manage" },
  { to: "/panel/admin/mine-onboard", label: "ثبت معدن جدید", permission: "users:manage" },
  { to: "/panel/admin/mine-settings", label: "تنظیمات معدن", permission: "users:manage" },
  { to: "/panel/admin/jobs", label: "کارهای پس‌زمینه", permissions: ["settlement:execute", "ops:*"] },
  { to: "/panel/admin/reconciliation", label: "تطبیق شبانه", permission: "users:manage" },
  { to: "/panel/admin/audit", label: "سوابق تغییرات", permission: "audit:read" },
  {
    to: "/panel/admin/period-statement",
    label: "صورت وضعیت دوره",
    permissions: ["users:manage", "settlement:read", "coop:manage"],
  },
  { to: "/panel/admin/kpi", label: "شاخص‌های عملکرد", permissions: ["settlement:execute", "ops:*"] },
  { to: "/panel/admin/finance/by-load", label: "مالی هر بار", permission: "users:manage" },
];

export function navItemAllowed(item: NavItem, can: (required: string | string[]) => boolean): boolean {
  if (!item.permission && !item.permissions) return true;
  const required = item.permissions ?? (item.permission ? [item.permission] : []);
  return can(required);
}

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

/** nav اصلی ≤۵ + بقیه در «بیشتر» — UX-WEB-SIMPLE-1 */
export function splitNavForRole(
  nav: NavItem[],
  role: string | undefined,
  can: (required: string | string[]) => boolean,
): { primary: NavItem[]; more: NavItem[] } {
  const allowed = navForRole(nav, role, can);
  if (allowed.length <= MAX_PRIMARY_NAV) {
    return { primary: allowed, more: [] };
  }

  const home = allowed.find((i) => i.to === "/panel");
  const roleHome = roleHomeFor(role);
  const priorityPaths: string[] = ["/panel"];
  if (roleHome) {
    priorityPaths.push(roleHome.defaultPath);
    for (const a of roleHome.quickActions) {
      if (!priorityPaths.includes(a.to)) priorityPaths.push(a.to);
    }
  }

  const primary: NavItem[] = [];
  const used = new Set<string>();

  for (const path of priorityPaths) {
    if (primary.length >= MAX_PRIMARY_NAV) break;
    const item = allowed.find((i) => i.to === path);
    if (item && !used.has(item.to)) {
      primary.push(item);
      used.add(item.to);
    }
  }

  for (const item of allowed) {
    if (primary.length >= MAX_PRIMARY_NAV) break;
    if (!used.has(item.to)) {
      primary.push(item);
      used.add(item.to);
    }
  }

  const more = allowed.filter((i) => !used.has(i.to));
  if (home && !primary.some((i) => i.to === "/panel")) {
    primary.unshift(home);
    if (primary.length > MAX_PRIMARY_NAV) primary.pop();
  }

  return { primary, more };
}
