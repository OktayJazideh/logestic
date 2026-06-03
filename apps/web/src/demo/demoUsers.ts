/**
 * Demo personas — must match apps/backend/scripts/seed.ts after `npm run db:seed`.
 * Data is interconnected (Taftan mine 1, coop 1, driver/fleet/KYC/contract).
 */

export type DemoApp = "web" | "driver" | "community";

export type DemoPersona = {
  id: string;
  roleLabel: string;
  mobile: string;
  apps: DemoApp[];
  workspaceHint: string;
  flowHint: string;
};

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: "admin",
    roleLabel: "ادمین پلتفرم",
    mobile: "09000000000",
    apps: ["web"],
    workspaceHint: "OPERATIONAL · معدن ۱",
    flowHint: "صورت وضعیت، audit، پرداخت معدن",
  },
  {
    id: "employer",
    roleLabel: "کارفرما / معدن",
    mobile: "09000000007",
    apps: ["web"],
    workspaceHint: "OPERATIONAL · معدن ۱",
    flowHint: "ثبت نیاز حمل",
  },
  {
    id: "ops_admin",
    roleLabel: "مدیر عملیات",
    mobile: "09000000002",
    apps: ["web"],
    workspaceHint: "OPERATIONAL · معدن ۱",
    flowHint: "dispatch، تأیید باسکول",
  },
  {
    id: "coop_op",
    roleLabel: "اپراتور باسکول",
    mobile: "09000000111",
    apps: ["web"],
    workspaceHint: "OPERATIONAL · معدن ۱",
    flowHint: "ثبت وزن در /panel/weighbridge",
  },
  {
    id: "coop_admin",
    roleLabel: "مدیر تعاونی",
    mobile: "09000000001",
    apps: ["web", "community"],
    workspaceHint: "COMMUNITY · معدن ۱",
    flowHint: "KYC، اعضا، صورت وضعیت",
  },
  {
    id: "driver",
    roleLabel: "راننده",
    mobile: "09000000003",
    apps: ["driver"],
    workspaceHint: "OPERATIONAL · معدن ۱",
    flowHint: "مأموریت تا تحویل (بدون ثبت وزن)",
  },
  {
    id: "fleet",
    roleLabel: "مالک ناوگان",
    mobile: "09000000004",
    apps: ["web"],
    workspaceHint: "OPERATIONAL · معدن ۱",
    flowHint: "کیف پول / ناوگان",
  },
  {
    id: "household_pending",
    roleLabel: "خانوار (در انتظار KYC)",
    mobile: "09000000005",
    apps: ["community"],
    workspaceHint: "COMMUNITY · معدن ۱",
    flowHint: "ثبت‌نام در اپ تعاونی",
  },
  {
    id: "household_ok",
    roleLabel: "خانوار (تأییدشده)",
    mobile: "09000001001",
    apps: ["community"],
    workspaceHint: "COMMUNITY · معدن ۱",
    flowHint: "سهم و کیف پول",
  },
  {
    id: "consultant",
    roleLabel: "مشاور ساعتی",
    mobile: "09000000006",
    apps: ["web"],
    workspaceHint: "OPERATIONAL · معدن ۱",
    flowHint: "تأیید کار ساعتی",
  },
];

export function personasForApp(app: DemoApp): DemoPersona[] {
  return DEMO_PERSONAS.filter((p) => p.apps.includes(app));
}

/** Dev/UAT — local dev, or production build with VITE_ENABLE_DEMO_LOGIN=true */
export function isDemoLoginEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_LOGIN === "true";
}

export function getApiOrigin(apiBase = import.meta.env.VITE_API_BASE ?? "http://localhost:4000/api"): string {
  return apiBase.replace(/\/api\/?$/i, "");
}

export async function fetchDevOtp(mobile: string, apiBase?: string): Promise<string | null> {
  const origin = getApiOrigin(apiBase);
  try {
    const r = await fetch(`${origin}/api/auth/__dev/otp?mobile_number=${encodeURIComponent(mobile)}`);
    const j = (await r.json()) as { success?: boolean; data?: { otp?: string } };
    if (j.success && j.data?.otp) return j.data.otp;
  } catch {
    /* ignore */
  }
  return null;
}
