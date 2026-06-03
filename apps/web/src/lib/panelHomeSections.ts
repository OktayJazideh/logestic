import type { NavItem } from "../config/panelNav";
import { navItemAllowed } from "../config/panelNav";

export type PanelHomeSection = {
  to: string;
  title: string;
  description: string;
  permission?: string;
  permissions?: string[];
};

/** کاتالوگ کارت‌های خانه — در UI فقط موارد با canAccess نمایش داده می‌شوند */
export const PANEL_HOME_SECTIONS: PanelHomeSection[] = [
  {
    to: "/panel/ops",
    title: "داشبورد عملیاتی",
    description: "نمای کلی مأموریت‌ها، باسکول و وضعیت دوره",
    permissions: ["ops:*", "users:manage"],
  },
  {
    to: "/panel/coop",
    title: "درخواست‌های تعاونی",
    description: "معدن، روستاها و نرخ فعال",
    permission: "coop:manage",
  },
  {
    to: "/panel/employer",
    title: "ثبت نیاز کارفرما",
    description: "نیاز حمل تنی یا کار ساعتی",
    permission: "needs:create",
  },
  {
    to: "/panel/employer/inbox",
    title: "پیگیری نیازهای کارفرما",
    description: "فهرست نیازهای ثبت‌شده و وضعیت آن‌ها",
    permissions: ["needs:read_own", "ops:*", "users:manage"],
  },
  {
    to: "/panel/dispatch-board",
    title: "بورد تخصیص",
    description: "تخصیص راننده و ناوگان به مأموریت",
    permission: "dispatch:create",
  },
  {
    to: "/panel/missions",
    title: "بورد مأموریت",
    description: "مأموریت‌ها و نرخ‌های فعال",
    permissions: ["dispatch:create", "members:read"],
  },
  {
    to: "/panel/weighbridge",
    title: "باسکول",
    description: "ثبت وزن و تأیید تیکت",
    permission: "weighbridge:submit",
  },
  {
    to: "/panel/payments",
    title: "نگهداری پرداخت",
    description: "نگهداری، آزادسازی یا برگشت پرداخت مشکوک",
    permission: "hold:create",
  },
  {
    to: "/panel/consultant/hourly",
    title: "کارکرد ساعتی",
    description: "تأیید یا رد کارکرد پایان‌یافته",
    permission: "hourly:verify",
  },
  {
    to: "/panel/settlement",
    title: "تسویه و سهم خانوار",
    description: "بسته تسویه و وضعیت سهم ماهانه",
    permission: "settlement:read",
  },
  {
    to: "/panel/approvals",
    title: "صندوق تأییدها",
    description: "تأییدهای در انتظار مدیریت",
    permissions: ["coop:manage", "settlement:approve"],
  },
  {
    to: "/panel/kyc",
    title: "صندوق احراز هویت",
    description: "بررسی درخواست‌های عضویت",
    permissions: ["kyc:approve", "kyc:review"],
  },
  {
    to: "/panel/members",
    title: "شفافیت اعضا",
    description: "اطلاعات عمومی و ثبت اعتراض",
    permission: "members:read",
  },
  {
    to: "/panel/wallet",
    title: "کیف پول",
    description: "مانده و گردش حساب",
    permission: "wallet:read_own",
  },
  {
    to: "/panel/fleet-owner",
    title: "داشبورد مالک ناوگان",
    description: "ناوگان و درآمد",
    permission: "vehicles:read_own",
  },
  {
    to: "/panel/rate-cards",
    title: "کارت نرخ",
    description: "تعریف و فعال‌سازی نرخ",
    permissions: ["coop:manage", "settlement:execute"],
  },
  {
    to: "/panel/admin/finance",
    title: "داشبورد مالی",
    description: "خلاصه سهم‌ها و گزارش",
    permission: "users:manage",
  },
  {
    to: "/panel/admin/audit",
    title: "سوابق تغییرات",
    description: "مرور لاگ تغییرات سیستم",
    permission: "audit:read",
  },
  {
    to: "/panel/admin/period-statement",
    title: "صورت وضعیت دوره",
    description: "پیش‌نویس، تأیید و قفل دوره",
    permissions: ["users:manage", "settlement:read", "coop:manage"],
  },
  {
    to: "/panel/admin/users",
    title: "مدیریت کاربران",
    description: "نقش‌ها و دسترسی",
    permission: "users:manage",
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
