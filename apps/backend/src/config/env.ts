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
  KAVENEGAR_API_KEY: z.string().optional(),
  KAVENEGAR_SENDER: z.string().optional(),
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
  PLATFORM_NAME: z.string().min(1).default("Logestic"),
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
  KAVENEGAR_API_KEY: process.env.KAVENEGAR_API_KEY,
  KAVENEGAR_SENDER: process.env.KAVENEGAR_SENDER,
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

/** Reads live process.env first (tests / runtime overrides), then parsed env. */
export function resolveSmsProvider(): "mock" | "kavenegar" | "faraz" {
  const raw = process.env.SMS_PROVIDER ?? env.SMS_PROVIDER;
  if (raw === "kavenegar" || raw === "faraz" || raw === "mock") return raw;
  if (raw === "farazsms") return "faraz";
  return "mock";
}