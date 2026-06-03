/** برچسب فارسی نقش‌ها و وضعیت‌های رایج — برای نمایش در UI */
const ROLE_LABELS: Record<string, string> = {
  ADMIN: "ادمین پلتفرم",
  OPERATION_ADMIN: "مدیر عملیات",
  COOP_ADMIN: "مدیر تعاونی",
  COOP_OPERATOR: "اپراتور باسکول",
  OPERATOR: "اپراتور معدن",
  CONSULTANT: "مشاور ساعتی",
  DRIVER: "راننده",
  FLEET_OWNER: "مالک ناوگان",
  HOUSEHOLD: "خانوار",
  EMPLOYER: "کارفرما",
  COOP: "تعاونی (قدیمی)",
};

export function roleLabelFa(role: string | undefined): string {
  if (!role) return "—";
  return ROLE_LABELS[role] ?? role;
}

const HOURLY_STATUS_LABELS: Record<string, string> = {
  STARTED: "در حال اجرا",
  ENDED: "پایان‌یافته (در انتظار تأیید)",
  APPROVED: "تأییدشده",
  REJECTED: "ردشده",
  PENDING: "در انتظار",
};

export function hourlyStatusLabelFa(status: string): string {
  return HOURLY_STATUS_LABELS[status] ?? status;
}
