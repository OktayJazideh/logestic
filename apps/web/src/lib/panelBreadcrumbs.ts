/** breadcrumb فارسی برای مسیرهای پنل — UX-WEB-SIMPLE-1 */

export type BreadcrumbSegment = { label: string; to?: string };

const ROUTE_LABELS: Record<string, string> = {
  "/panel": "خانه",
  "/panel/ops": "داشبورد عملیاتی",
  "/panel/coop": "درخواست‌های تعاونی",
  "/panel/employer": "ثبت نیاز",
  "/panel/employer/inbox": "پیگیری نیازها",
  "/panel/dispatch-board": "تخصیص بار",
  "/panel/missions": "مأموریت‌ها",
  "/panel/weighbridge": "باسکول",
  "/panel/payments": "نگهداری پرداخت",
  "/panel/consultant/hourly": "کارکرد ساعتی",
  "/panel/settlement": "تسویه",
  "/panel/approvals": "صندوق تأییدها",
  "/panel/kyc": "تأیید هویت",
  "/panel/members": "شفافیت اعضا",
  "/panel/wallet": "کیف پول",
  "/panel/fleet-owner": "مالک ناوگان",
  "/panel/rate-cards": "کارت نرخ",
  "/panel/admin/finance": "داشبورد مالی",
  "/panel/admin/finance/by-load": "مالی هر بار",
  "/panel/admin/audit": "سوابق تغییرات",
  "/panel/admin/period-statement": "صورت وضعیت دوره",
  "/panel/admin/users": "مدیریت کاربران",
  "/panel/admin/user-requests": "درخواست‌های کاربر",
  "/panel/user-requests": "درخواست کاربر جدید",
  "/panel/admin/rules": "قوانین سیستم",
  "/panel/admin/mine-settings": "تنظیمات معدن",
  "/panel/admin/jobs": "کارهای پس‌زمینه",
  "/panel/admin/reconciliation": "تطبیق شبانه",
  "/panel/admin/kpi": "شاخص‌های عملکرد",
};

/** طولانی‌ترین prefix match */
function labelForPath(pathname: string): string {
  const exact = ROUTE_LABELS[pathname];
  if (exact) return exact;

  const keys = Object.keys(ROUTE_LABELS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (pathname === key || pathname.startsWith(`${key}/`)) {
      return ROUTE_LABELS[key]!;
    }
  }
  return "پنل";
}

export function breadcrumbsForPath(pathname: string): BreadcrumbSegment[] {
  const normalized = pathname.replace(/\/+$/, "") || "/panel";
  const pageLabel = labelForPath(normalized);

  if (normalized === "/panel") {
    return [{ label: "خانه" }];
  }

  return [
    { label: "خانه", to: "/panel" },
    { label: pageLabel },
  ];
}
