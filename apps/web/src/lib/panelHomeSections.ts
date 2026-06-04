import type { NavItem } from "../config/panelNav";
import { navItemAllowed } from "../config/panelNav";
import type { HomeIconKey } from "../components/simple/PanelHomeIcons";
import { roleHomeFor } from "./roleHome";

export type PanelHomeSection = {
  to: string;
  title: string;
  description: string;
  iconKey: HomeIconKey;
  homePriority: number;
  permission?: string;
  permissions?: string[];
  roles?: string[];
};

/** کاتالوگ کارت‌های خانه — در UI فقط موارد با canAccess نمایش داده می‌شوند */
export const PANEL_HOME_SECTIONS: PanelHomeSection[] = [
  {
    to: "/panel/ops",
    title: "داشبورد عملیاتی",
    description: "نمای کلی مأموریت‌ها، باسکول و وضعیت دوره",
    iconKey: "ops",
    homePriority: 10,
    permissions: ["ops:*", "users:manage"],
    roles: ["OPERATION_ADMIN", "ADMIN"],
  },
  {
    to: "/panel/weighbridge",
    title: "باسکول",
    description: "ثبت وزن و تأیید تیکت",
    iconKey: "weighbridge",
    homePriority: 5,
    permission: "weighbridge:submit",
    roles: ["COOP_OPERATOR"],
  },
  {
    to: "/panel/dispatch-board",
    title: "تخصیص بار",
    description: "اجرای تخصیص خودکار به مأموریت",
    iconKey: "dispatch",
    homePriority: 8,
    permission: "dispatch:create",
    roles: ["OPERATION_ADMIN", "ADMIN"],
  },
  {
    to: "/panel/employer",
    title: "ثبت نیاز کارفرما",
    description: "نیاز حمل تنی یا کار ساعتی",
    iconKey: "employer",
    homePriority: 5,
    permission: "needs:create",
    roles: ["EMPLOYER", "ADMIN"],
  },
  {
    to: "/panel/employer/inbox",
    title: "پیگیری نیازهای کارفرما",
    description: "فهرست نیازهای ثبت‌شده و وضعیت آن‌ها",
    iconKey: "employer",
    homePriority: 6,
    permissions: ["needs:read_own", "ops:*", "users:manage"],
    roles: ["EMPLOYER"],
  },
  {
    to: "/panel/kyc",
    title: "تأیید هویت",
    description: "بررسی درخواست‌های عضویت",
    iconKey: "kyc",
    homePriority: 5,
    permissions: ["kyc:approve", "kyc:review"],
    roles: ["COOP_ADMIN", "ADMIN"],
  },
  {
    to: "/panel/settlement",
    title: "تسویه و سهم خانوار",
    description: "بسته تسویه و وضعیت سهم ماهانه",
    iconKey: "settlement",
    homePriority: 7,
    permission: "settlement:read",
    roles: ["OPERATION_ADMIN", "OPERATION_LOCKER"],
  },
  {
    to: "/panel/approvals",
    title: "صندوق تأییدها",
    description: "تأییدهای در انتظار مدیریت",
    iconKey: "approvals",
    homePriority: 8,
    permissions: ["coop:manage", "settlement:approve"],
  },
  {
    to: "/panel/admin/finance",
    title: "داشبورد مالی",
    description: "خلاصه سهم‌ها و گزارش",
    iconKey: "finance",
    homePriority: 5,
    permission: "users:manage",
    roles: ["ADMIN"],
  },
  {
    to: "/panel/admin/users",
    title: "مدیریت کاربران",
    description: "نقش‌ها و دسترسی",
    iconKey: "users",
    homePriority: 9,
    permission: "users:manage",
    roles: ["ADMIN"],
  },
  {
    to: "/panel/admin/user-requests",
    title: "درخواست‌های کاربر",
    description: "تأیید درخواست واحدها",
    iconKey: "users",
    homePriority: 8,
    permission: "users:manage",
    roles: ["ADMIN", "COOP_ADMIN", "OPERATION_ADMIN"],
  },
  {
    to: "/panel/user-requests",
    title: "ثبت کاربر جدید",
    description: "درخواست افزودن کاربر",
    iconKey: "users",
    homePriority: 6,
    permission: "users:request",
  },
  {
    to: "/panel/coop",
    title: "درخواست‌های تعاونی",
    description: "معدن، روستاها و نرخ فعال",
    iconKey: "coop",
    homePriority: 20,
    permission: "coop:manage",
  },
  {
    to: "/panel/missions",
    title: "بورد مأموریت",
    description: "مأموریت‌ها و نرخ‌های فعال",
    iconKey: "missions",
    homePriority: 25,
    permissions: ["dispatch:create", "members:read"],
  },
  {
    to: "/panel/payments",
    title: "نگهداری پرداخت",
    description: "نگهداری، آزادسازی یا برگشت پرداخت مشکوک",
    iconKey: "finance",
    homePriority: 30,
    permission: "hold:create",
  },
  {
    to: "/panel/consultant/hourly",
    title: "کارکرد ساعتی",
    description: "تأیید یا رد کارکرد پایان‌یافته",
    iconKey: "missions",
    homePriority: 1,
    permission: "hourly:verify",
    roles: ["CONSULTANT"],
  },
  {
    to: "/panel/wallet",
    title: "کیف پول",
    description: "مانده و گردش حساب",
    iconKey: "wallet",
    homePriority: 15,
    permission: "wallet:read_own",
  },
  {
    to: "/panel/fleet-owner",
    title: "داشبورد مالک ناوگان",
    description: "ناوگان و درآمد",
    iconKey: "missions",
    homePriority: 5,
    permission: "vehicles:read_own",
    roles: ["FLEET_OWNER"],
  },
  {
    to: "/panel/rate-cards",
    title: "کارت نرخ",
    description: "تعریف و فعال‌سازی نرخ",
    iconKey: "finance",
    homePriority: 40,
    permissions: ["coop:manage", "settlement:execute"],
  },
  {
    to: "/panel/admin/audit",
    title: "سوابق تغییرات",
    description: "مرور لاگ تغییرات سیستم",
    iconKey: "default",
    homePriority: 50,
    permission: "audit:read",
  },
  {
    to: "/panel/admin/period-statement",
    title: "صورت وضعیت دوره",
    description: "پیش‌نویس، تأیید و قفل دوره",
    iconKey: "finance",
    homePriority: 12,
    permissions: ["users:manage", "settlement:read", "coop:manage"],
    roles: ["COOP_ADMIN", "ADMIN"],
  },
  {
    to: "/panel/members",
    title: "شفافیت اعضا",
    description: "اطلاعات عمومی و ثبت اعتراض",
    iconKey: "kyc",
    homePriority: 35,
    permission: "members:read",
  },
];

export type PanelHomeSectionView = PanelHomeSection & { canAccess: boolean };

export function allHomeSectionsWithAccess(
  can: (required: string | string[]) => boolean,
): PanelHomeSectionView[] {
  return PANEL_HOME_SECTIONS.map((s) => {
    const item: NavItem = {
      to: s.to,
      label: s.title,
      permission: s.permission,
      permissions: s.permissions,
    };
    return { ...s, canAccess: navItemAllowed(item, can) };
  });
}

const MAX_HOME_CARDS = 5;

/** کارت‌های خانه نقش‌محور — حداکثر ۵ */
export function homeCardsForRole(
  role: string | undefined,
  can: (required: string | string[]) => boolean,
): PanelHomeSectionView[] {
  const accessible = allHomeSectionsWithAccess(can).filter((s) => s.canAccess);

  const roleFiltered =
    role != null
      ? accessible.filter((s) => !s.roles?.length || s.roles.includes(role))
      : accessible;

  const byPath = new Map(roleFiltered.map((s) => [s.to, s]));

  const roleHome = roleHomeFor(role);
  const ordered: PanelHomeSectionView[] = [];
  const seen = new Set<string>();

  if (roleHome) {
    for (const qa of roleHome.quickActions) {
      const sec = byPath.get(qa.to);
      if (sec && !seen.has(sec.to)) {
        ordered.push(sec);
        seen.add(sec.to);
      }
    }
    const def = byPath.get(roleHome.defaultPath);
    if (def && !seen.has(def.to)) {
      ordered.unshift(def);
      seen.add(def.to);
    }
  }

  const rest = [...roleFiltered]
    .filter((s) => !seen.has(s.to))
    .sort((a, b) => a.homePriority - b.homePriority);

  for (const s of rest) {
    if (!seen.has(s.to)) {
      ordered.push(s);
      seen.add(s.to);
    }
  }

  return ordered.slice(0, MAX_HOME_CARDS);
}
