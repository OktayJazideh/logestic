import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  DEV_ADMIN_MOBILE: z.string().optional(),
  DEV_COOP_MOBILE: z.string().optional(),
  DEV_EMPLOYER_MOBILE: z.string().optional(),
  DEV_FLEET_OWNER_MOBILE: z.string().optional(),
  DEV_HOUSEHOLD_MOBILE: z.string().optional(),
  DEV_CONSULTANT_MOBILE: z.string().optional(),
  /** manual = dispatch only via POST /admin/needs/:id/dispatch; auto = dispatch right after employer need create */
  DISPATCH_MODE: z.enum(["manual", "auto"]).default("manual"),
  /** WF-QUEUE-1: driver slot scheduling (wireframe 9.3) — off in MVP; no cron when false. */
  ENABLE_DISPATCH_QUEUE: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  /** mock | kavenegar | faraz — legacy: none→mock, farazsms→faraz. */
  SMS_PROVIDER: z
    .enum(["mock", "kavenegar", "faraz", "none", "farazsms"])
    .default("mock")
    .transform((v) => {
      if (v === "none") return "mock" as const;
      if (v === "farazsms") return "faraz" as const;
      return v;
    }),
  /** Unified SMS credentials (preferred). Provider-specific vars remain as fallback. */
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_LINE: z.string().optional(),
  /** Kavenegar lookup template name for OTP (required for shared/international lines). */
  SMS_OTP_TEMPLATE: z.string().optional(),
  KAVENEGAR_API_KEY: z.string().optional(),
  KAVENEGAR_SENDER: z.string().optional(),
  KAVENEGAR_OTP_TEMPLATE: z.string().optional(),
  FARAZSMS_API_KEY: z.string().optional(),
  FARAZSMS_SENDER: z.string().optional(),
  FCM_SERVER_KEY: z.string().optional(),
  /** Missions verified longer than this (hours) count as delayed in KPI-1. */
  KPI_DELAY_HOURS: z.coerce.number().positive().default(8),
  /** When "true", household register requires national_id to match mobile (last 10 digits). */
  KYC_MATCH_MOBILE_NATIONAL_ID: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  /** When true, bulk household import sets APPROVED (default false — PENDING KYC). */
  IMPORT_AUTO_APPROVE: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  /** JSON map weighbridge_id → API secret (or { key, mine_id }). WB-INT-1 */
  WEIGHBRIDGE_KEYS: z.string().optional(),
  /** mock | none — BANK-AUTO-1 auto payout after settlement lock */
  BANK_ADAPTER: z.enum(["mock", "none"]).default("mock"),
  /** When true, MockBankAdapter rejects all payout lines (failure path tests). */
  MOCK_BANK_FAIL: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  /** Public base URL for receipt QR links (no trailing slash). */
  PUBLIC_URL: z.string().url().default("http://localhost:4000"),
  /** Brand name on settlement receipt PDFs. */
  PLATFORM_NAME: z.string().min(1).default("Hamsahman"),
  /** Comma-separated allowed browser origins (production). Empty → derive from PUBLIC_URL. */
  CORS_ORIGINS: z.string().optional(),
  /** Express trust proxy (set true behind nginx). */
  TRUST_PROXY: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  /** UAT on production domain: allow /api/auth/__dev/* for one-tap demo login. */
  ENABLE_DEMO_LOGIN: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

export type Env = z.infer<typeof EnvSchema>;

export type WeighbridgeBridgeConfig = {
  id: number;
  key: string;
  mine_id: number;
};

let weighbridgeBridgeConfigsCache: Map<number, WeighbridgeBridgeConfig> | null = null;

function parseWeighbridgeKeys(raw: string | undefined): Map<number, WeighbridgeBridgeConfig> {
  const map = new Map<number, WeighbridgeBridgeConfig>();
  if (!raw?.trim()) return map;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("WEIGHBRIDGE_KEYS must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("WEIGHBRIDGE_KEYS must be a JSON object");
  }
  for (const [idStr, val] of Object.entries(parsed as Record<string, unknown>)) {
    const id = Number(idStr);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (typeof val === "string" && val.length > 0) {
      map.set(id, { id, key: val, mine_id: id });
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      const o = val as Record<string, unknown>;
      const key = typeof o.key === "string" ? o.key : "";
      const mineId = o.mine_id != null ? Number(o.mine_id) : id;
      if (key.length > 0 && Number.isInteger(mineId) && mineId > 0) {
        map.set(id, { id, key, mine_id: mineId });
      }
    }
  }
  return map;
}

function getWeighbridgeBridgeConfigsMap(): Map<number, WeighbridgeBridgeConfig> {
  if (!weighbridgeBridgeConfigsCache) {
    weighbridgeBridgeConfigsCache = parseWeighbridgeKeys(process.env.WEIGHBRIDGE_KEYS);
  }
  return weighbridgeBridgeConfigsCache;
}

/** @internal tests may reset after changing process.env.WEIGHBRIDGE_KEYS */
export function resetWeighbridgeKeysCacheForTests() {
  weighbridgeBridgeConfigsCache = null;
}

export const env: Env = EnvSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  DEV_ADMIN_MOBILE: process.env.DEV_ADMIN_MOBILE,
  DEV_COOP_MOBILE: process.env.DEV_COOP_MOBILE,
  DEV_EMPLOYER_MOBILE: process.env.DEV_EMPLOYER_MOBILE,
  DEV_FLEET_OWNER_MOBILE: process.env.DEV_FLEET_OWNER_MOBILE,
  DEV_HOUSEHOLD_MOBILE: process.env.DEV_HOUSEHOLD_MOBILE,
  DEV_CONSULTANT_MOBILE: process.env.DEV_CONSULTANT_MOBILE,
  DISPATCH_MODE: process.env.DISPATCH_MODE,
  ENABLE_DISPATCH_QUEUE: process.env.ENABLE_DISPATCH_QUEUE,
  SMS_PROVIDER: process.env.SMS_PROVIDER,
  SMS_API_KEY: process.env.SMS_API_KEY,
  SMS_SENDER_LINE: process.env.SMS_SENDER_LINE,
  SMS_OTP_TEMPLATE: process.env.SMS_OTP_TEMPLATE,
  KAVENEGAR_API_KEY: process.env.KAVENEGAR_API_KEY,
  KAVENEGAR_SENDER: process.env.KAVENEGAR_SENDER,
  KAVENEGAR_OTP_TEMPLATE: process.env.KAVENEGAR_OTP_TEMPLATE,
  FARAZSMS_API_KEY: process.env.FARAZSMS_API_KEY,
  FARAZSMS_SENDER: process.env.FARAZSMS_SENDER,
  FCM_SERVER_KEY: process.env.FCM_SERVER_KEY,
  KPI_DELAY_HOURS: process.env.KPI_DELAY_HOURS,
  KYC_MATCH_MOBILE_NATIONAL_ID: process.env.KYC_MATCH_MOBILE_NATIONAL_ID,
  IMPORT_AUTO_APPROVE: process.env.IMPORT_AUTO_APPROVE,
  WEIGHBRIDGE_KEYS: process.env.WEIGHBRIDGE_KEYS,
  BANK_ADAPTER: process.env.BANK_ADAPTER,
  MOCK_BANK_FAIL: process.env.MOCK_BANK_FAIL,
  PUBLIC_URL: process.env.PUBLIC_URL,
  PLATFORM_NAME: process.env.PLATFORM_NAME,
  CORS_ORIGINS: process.env.CORS_ORIGINS,
  TRUST_PROXY: process.env.TRUST_PROXY,
  ENABLE_DEMO_LOGIN: process.env.ENABLE_DEMO_LOGIN,
});

export function getWeighbridgeBridgeConfig(weighbridgeId: number): WeighbridgeBridgeConfig | null {
  return getWeighbridgeBridgeConfigsMap().get(weighbridgeId) ?? null;
}

export function validateWeighbridgeApiKey(weighbridgeId: number, apiKey: string | undefined): WeighbridgeBridgeConfig | null {
  if (!apiKey?.trim()) return null;
  const cfg = getWeighbridgeBridgeConfig(weighbridgeId);
  if (!cfg) return null;
  if (cfg.key !== apiKey.trim()) return null;
  return cfg;
}

export function listWeighbridgeBridgeConfigs(): WeighbridgeBridgeConfig[] {
  return [...getWeighbridgeBridgeConfigsMap().values()];
}

export function getDispatchMode(): "manual" | "auto" {
  return env.DISPATCH_MODE;
}

export function isDispatchAuto(): boolean {
  return env.DISPATCH_MODE === "auto";
}

/** WF-QUEUE-1: false by default — future queue_slots scheduling gated on this flag. */
export function isDispatchQueueEnabled(): boolean {
  return env.ENABLE_DISPATCH_QUEUE === true;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function getSmsApiKey(): string {
  const unified = (process.env.SMS_API_KEY ?? env.SMS_API_KEY)?.trim();
  if (unified) return unified;
  const provider = resolveSmsProvider();
  if (provider === "kavenegar") {
    return (process.env.KAVENEGAR_API_KEY ?? env.KAVENEGAR_API_KEY)?.trim() ?? "";
  }
  if (provider === "faraz") {
    return (process.env.FARAZSMS_API_KEY ?? env.FARAZSMS_API_KEY)?.trim() ?? "";
  }
  return "";
}

export function getSmsSenderLine(): string {
  const unified = (process.env.SMS_SENDER_LINE ?? env.SMS_SENDER_LINE)?.trim();
  if (unified) return unified;
  const provider = resolveSmsProvider();
  if (provider === "kavenegar") {
    return (process.env.KAVENEGAR_SENDER ?? env.KAVENEGAR_SENDER)?.trim() ?? "";
  }
  if (provider === "faraz") {
    return (process.env.FARAZSMS_SENDER ?? env.FARAZSMS_SENDER)?.trim() ?? "";
  }
  return "";
}

/** Kavenegar verify/lookup template — required for shared/international OTP lines. */
export function getSmsOtpTemplate(): string {
  const unified = (process.env.SMS_OTP_TEMPLATE ?? env.SMS_OTP_TEMPLATE)?.trim();
  if (unified) return unified;
  if (resolveSmsProvider() === "kavenegar") {
    return (process.env.KAVENEGAR_OTP_TEMPLATE ?? env.KAVENEGAR_OTP_TEMPLATE)?.trim() ?? "";
  }
  return "";
}

/** Reads live process.env first (tests / runtime overrides), then parsed env. */
export function resolveSmsProvider(): "mock" | "kavenegar" | "faraz" {
  const raw = process.env.SMS_PROVIDER ?? env.SMS_PROVIDER;
  if (raw === "kavenegar" || raw === "faraz" || raw === "mock") return raw;
  if (raw === "farazsms") return "faraz";
  return "mock";
}

/** CORS allowlist. Development: allow all. Production: CORS_ORIGINS or PUBLIC_URL origin. */
export function getCorsOriginConfig(): true | string[] {
  if (!isProduction()) return true;
  const raw = (process.env.CORS_ORIGINS ?? env.CORS_ORIGINS)?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  try {
    const parsed = new URL(env.PUBLIC_URL);
    const host = parsed.hostname;
    const port = parsed.port ? `:${parsed.port}` : "";
    const bareHost = host.startsWith("www.") ? host.slice(4) : host;
    const wwwHost = host.startsWith("www.") ? host : `www.${host}`;
    const bare = `${parsed.protocol}//${bareHost}${port}`;
    const www = `${parsed.protocol}//${wwwHost}${port}`;
    return [...new Set([parsed.origin, bare, www])];
  } catch {
    return true;
  }
}

export function shouldTrustProxy(): boolean {
  if (process.env.TRUST_PROXY === "true" || env.TRUST_PROXY === true) return true;
  return isProduction();
}

/**
 * DEPLOY-SAHMAN-1: production must use real SMS — fail fast at startup.
 */
/** __dev/login and __dev/otp — off in production unless ENABLE_DEMO_LOGIN for UAT. */
export function isDevAuthEnabled(): boolean {
  if (!isProduction()) return true;
  return env.ENABLE_DEMO_LOGIN === true;
}

export function assertProductionReady(): void {
  if (process.env.NODE_ENV === "test" || !isProduction()) return;
  const provider = resolveSmsProvider();
  if (provider === "mock") {
    throw new Error("production: set SMS_PROVIDER=kavenegar (or faraz), not mock");
  }
  if (!getSmsApiKey()) {
    throw new Error("production: SMS_API_KEY is required");
  }
  if (!getSmsSenderLine()) {
    throw new Error("production: SMS_SENDER_LINE is required");
  }
}