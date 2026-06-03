/**
 * Demo personas — must match apps/backend/scripts/seed.ts after `npm run db:seed`.
 * Data is interconnected (Taftan mine 1, coop 1, driver/fleet/KYC/contract).
 */

export type DemoApp = "web" | "driver" | "community";

export type DemoWorkspace = {
  mine_id: number;
  membership_kind: "OPERATIONAL" | "COMMUNITY";
  cooperative_id?: number;
};

export type DemoPersona = {
  id: string;
  roleLabel: string;
  mobile: string;
  apps: DemoApp[];
  workspaceHint: string;
  flowHint: string;
  /** Web demo: auto-select workspace then open /panel */
  workspace?: DemoWorkspace;
};

const MINE_1_OP: DemoWorkspace = { mine_id: 1, membership_kind: "OPERATIONAL" };
const MINE_1_COMMUNITY: DemoWorkspace = { mine_id: 1, cooperative_id: 1, membership_kind: "COMMUNITY" };

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: "admin",
    roleLabel: "ادمین پلتفرم",
    mobile: "09000000000",
    apps: ["web"],
    workspaceHint: "کار عملیاتی · معدن ۱",
    flowHint: "صورت وضعیت و پرداخت معدن",
    workspace: MINE_1_OP,
  },
  {
    id: "employer",
    roleLabel: "کارفرما / معدن",
    mobile: "09000000007",
    apps: ["web"],
    workspaceHint: "کار عملیاتی · معدن ۱",
    flowHint: "ثبت نیاز حمل",
    workspace: MINE_1_OP,
  },
  {
    id: "ops_admin",
    roleLabel: "مدیر عملیات",
    mobile: "09000000002",
    apps: ["web"],
    workspaceHint: "کار عملیاتی · معدن ۱",
    flowHint: "تخصیص و تأیید باسکول",
    workspace: MINE_1_OP,
  },
  {
    id: "coop_op",
    roleLabel: "اپراتور باسکول",
    mobile: "09000000111",
    apps: ["web"],
    workspaceHint: "عضویت تعاونی · معدن ۱",
    flowHint: "ثبت و تأیید وزن باسکول",
    workspace: MINE_1_COMMUNITY,
  },
  {
    id: "coop_admin",
    roleLabel: "مدیر تعاونی",
    mobile: "09000000001",
    apps: ["web", "community"],
    workspaceHint: "عضویت تعاونی · معدن ۱",
    flowHint: "احراز هویت و صورت وضعیت",
    workspace: MINE_1_COMMUNITY,
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
    workspaceHint: "کار عملیاتی · معدن ۱",
    flowHint: "کیف پول و ناوگان",
    workspace: MINE_1_OP,
  },
  {
    id: "household_pending",
    roleLabel: "خانوار (در انتظار KYC)",
    mobile: "09000000005",
    apps: ["community"],
    workspaceHint: "عضویت تعاونی · معدن ۱",
    flowHint: "ثبت‌نام در اپ تعاونی",
  },
  {
    id: "household_ok",
    roleLabel: "خانوار (تأییدشده)",
    mobile: "09000001001",
    apps: ["community"],
    workspaceHint: "عضویت تعاونی · معدن ۱",
    flowHint: "سهم و کیف پول",
  },
  {
    id: "consultant",
    roleLabel: "مشاور ساعتی",
    mobile: "09000000006",
    apps: ["web"],
    workspaceHint: "کار عملیاتی · معدن ۱",
    flowHint: "تأیید کارکرد ساعتی",
    workspace: MINE_1_OP,
  },
];

export function personasForApp(app: DemoApp): DemoPersona[] {
  return DEMO_PERSONAS.filter((p) => p.apps.includes(app));
}

/** Dev/UAT — local dev, explicit flag, or staging API on raw IP (VPS without domain). */
export function isDemoLoginEnabled(): boolean {
  if (import.meta.env.VITE_ENABLE_DEMO_LOGIN === "false") return false;
  if (import.meta.env.DEV) return true;
  if (import.meta.env.VITE_ENABLE_DEMO_LOGIN === "true") return true;
  const api = import.meta.env.VITE_API_BASE ?? "";
  if (/https?:\/\/(\d{1,3}\.){3}\d{1,3}/.test(api)) return true;
  return false;
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
