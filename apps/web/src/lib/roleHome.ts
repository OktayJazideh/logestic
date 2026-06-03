export type QuickAction = { to: string; label: string };

export type RoleHomeConfig = {
  defaultPath: string;
  quickActions: QuickAction[];
};

export const ROLE_HOME_CONFIG: Record<string, RoleHomeConfig> = {
  ADMIN: {
    defaultPath: "/panel/admin/finance",
    quickActions: [
      { to: "/panel/admin/finance", label: "داشبورد مالی" },
      { to: "/panel/admin/users", label: "مدیریت کاربران" },
      { to: "/panel/admin/user-requests", label: "درخواست‌های کاربر" },
    ],
  },
  OPERATION_ADMIN: {
    defaultPath: "/panel/ops",
    quickActions: [
      { to: "/panel/ops", label: "داشبورد عملیاتی" },
      { to: "/panel/user-requests", label: "ثبت کاربر جدید" },
      { to: "/panel/settlement", label: "تسویه" },
    ],
  },
  OPERATION_LOCKER: {
    defaultPath: "/panel/settlement",
    quickActions: [
      { to: "/panel/settlement", label: "تسویه" },
      { to: "/panel/approvals", label: "صندوق تأییدها" },
    ],
  },
  COOP_ADMIN: {
    defaultPath: "/panel/kyc",
    quickActions: [
      { to: "/panel/kyc", label: "احراز هویت" },
      { to: "/panel/user-requests", label: "ثبت کاربر جدید" },
      { to: "/panel/admin/period-statement", label: "صورت وضعیت" },
    ],
  },
  COOP_OPERATOR: {
    defaultPath: "/panel/weighbridge",
    quickActions: [{ to: "/panel/weighbridge", label: "باسکول" }],
  },
  EMPLOYER: {
    defaultPath: "/panel/employer/inbox",
    quickActions: [
      { to: "/panel/employer", label: "ثبت نیاز" },
      { to: "/panel/employer/inbox", label: "پیگیری نیازها" },
    ],
  },
  FLEET_OWNER: {
    defaultPath: "/panel/fleet-owner",
    quickActions: [
      { to: "/panel/fleet-owner", label: "ناوگان و درآمد" },
      { to: "/panel/wallet", label: "کیف پول" },
    ],
  },
  CONSULTANT: {
    defaultPath: "/panel/consultant/hourly",
    quickActions: [{ to: "/panel/consultant/hourly", label: "کارکرد ساعتی" }],
  },
  OPERATOR: {
    defaultPath: "/panel/employer",
    quickActions: [{ to: "/panel/employer", label: "کار ساعتی" }],
  },
};

export function roleHomeFor(role: string | undefined): RoleHomeConfig | null {
  if (!role) return null;
  return ROLE_HOME_CONFIG[role] ?? null;
}
