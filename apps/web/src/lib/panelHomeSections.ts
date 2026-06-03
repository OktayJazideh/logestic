import type { NavItem } from "../config/panelNav";
import { navItemAllowed } from "../config/panelNav";

export type PanelHomeSection = {
  to: string;
  title: string;
  description: string;
  permission?: string;
  permissions?: string[];
};

/** کارت‌های خانه — همان مجوزهای مسیر در App.tsx */
export const PANEL_HOME_SECTIONS: PanelHomeSection[] = [
  {
    to: "/panel/coop",
    title: "درخواست‌های تعاونی",
    description: "معدن، روستاها و نرخ فعال",
    permission: "coop:manage",
  },
  {
    to: "/panel/employer",
    title: "نیاز کارفرما",
    description: "ثبت نیاز حمل و پیگیری وضعیت",
    permission: "needs:create",
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
    description: "ثبت وزن و تأیید تیکت‌ها",
    permission: "weighbridge:submit",
  },
  {
    to: "/panel/payments",
    title: "نگهداری و آزادسازی پرداخت",
    description: "مدیریت پرداخت‌های مشکوک با ثبت دلیل",
    permission: "hold:create",
  },
  {
    to: "/panel/settlement",
    title: "تسویه و سهم خانوار",
    description: "بسته تسویه، قفل دوره و وضعیت سهم ماهانه",
    permission: "settlement:read",
  },
  {
    to: "/panel/kyc",
    title: "صندوق احراز هویت",
    description: "بررسی درخواست‌های در انتظار تأیید",
    permissions: ["kyc:approve", "kyc:review"],
  },
  {
    to: "/panel/members",
    title: "شفافیت اعضا و اعتراض",
    description: "نمایش کنترل‌شده و ثبت اعتراض",
    permission: "members:read",
  },
  {
    to: "/panel/wallet",
    title: "کیف پول",
    description: "مانده و گردش مالک ناوگان یا خانوار",
    permission: "wallet:read_own",
  },
  {
    to: "/panel/consultant/hourly",
    title: "کارکرد ساعتی",
    description: "تأیید یا رد کارکرد پایان‌یافته",
    permission: "hourly:verify",
  },
  {
    to: "/panel/admin/finance",
    title: "داشبورد مالی",
    description: "خلاصه سهم‌ها، نمودار و خروجی",
    permission: "users:manage",
  },
  {
    to: "/panel/admin/audit",
    title: "مرور سوابق تغییرات",
    description: "لاگ تغییرات سیستم",
    permission: "audit:read",
  },
];

export function homeSectionsForUser(can: (required: string | string[]) => boolean): PanelHomeSection[] {
  return PANEL_HOME_SECTIONS.filter((s) => {
    const item: NavItem = {
      to: s.to,
      label: s.title,
      permission: s.permission,
      permissions: s.permissions,
    };
    return navItemAllowed(item, can);
  });
}
