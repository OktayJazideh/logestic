import * as financeRulesRepo from "../repositories/financeRulesRepository";
import type { FinanceRuleRow, FinanceRuleScope } from "../repositories/financeRulesRepository";
import { computePeriodKey } from "../lib/periodKey";

export type RuleContext = {
  mineId?: number;
  cooperativeId?: number;
  at?: Date;
};

export const RULE_DEFAULTS: Record<string, number | string> = {
  "split.owner": 0.98,
  "split.platform": 0.02,
  "community.rial_per_verified_ton": 500_000,
  "weighbridge.threshold": 0.05,
  "settlement.period_days": 30,
  "settlement.owner_period_days": 7,
  "reverse.window_hours": 72,
  "pool.remainder.target": "rounding_bucket",
};

export const SEED_RULE_KEYS = Object.keys(RULE_DEFAULTS) as (keyof typeof RULE_DEFAULTS)[];

function parseNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (value && typeof value === "object" && "n" in (value as object)) {
    return parseNumericValue((value as { n: unknown }).n);
  }
  return null;
}

function scopeCandidates(ctx?: RuleContext): FinanceRuleScope[] {
  const out: FinanceRuleScope[] = [];
  if (ctx?.cooperativeId != null) {
    out.push({ type: "COOPERATIVE", cooperative_id: ctx.cooperativeId });
  }
  if (ctx?.mineId != null) {
    out.push({ type: "MINE", mine_id: ctx.mineId });
  }
  out.push({ type: "GLOBAL" });
  return out;
}

export class RuleEngine {
  async get(key: string, ctx?: RuleContext): Promise<unknown> {
    const at = ctx?.at ?? new Date();
    for (const scope of scopeCandidates(ctx)) {
      const row = await financeRulesRepo.findRuleValidAt(key, scope, at);
      if (row) return row.value;
    }
    if (key in RULE_DEFAULTS) return RULE_DEFAULTS[key];
    return null;
  }

  async getNumber(key: string, ctx?: RuleContext): Promise<number> {
    const raw = await this.get(key, ctx);
    const n = parseNumericValue(raw);
    if (n != null) return n;
    const def = RULE_DEFAULTS[key as keyof typeof RULE_DEFAULTS];
    if (typeof def === "number") return def;
    return 0;
  }

  /** Operational split only (owner + platform). Owner defaults to 1 − platform when unset. */
  async getSplitRatios(ctx?: RuleContext): Promise<{ owner: number; platform: number }> {
    const platform = await this.getNumber("split.platform", ctx);
    const rawOwner = await this.get("split.owner", ctx);
    const ownerParsed = parseNumericValue(rawOwner);
    const owner = ownerParsed != null ? ownerParsed : 1 - platform;
    return { owner, platform };
  }

  async getCommunityRialPerTon(ctx?: RuleContext): Promise<number> {
    return this.getNumber("community.rial_per_verified_ton", ctx);
  }

  async getPeriodKey(at = new Date(), ctx?: RuleContext): Promise<string> {
    const days = await this.getNumber("settlement.period_days", ctx);
    return computePeriodKey(at, days > 0 ? days : 30);
  }

  /** SET-CYCLE-1: owner weekly settlement window (default 7 days). */
  async getOwnerPeriodDays(ctx?: RuleContext): Promise<number> {
    const days = await this.getNumber("settlement.owner_period_days", ctx);
    return days > 0 ? days : 7;
  }

  async setActive(
    key: string,
    value: unknown,
    scope: FinanceRuleScope,
    effective_from: Date,
    created_by: number,
  ): Promise<{ activated: FinanceRuleRow; archived: FinanceRuleRow[] }> {
    return financeRulesRepo.setActiveFinanceRule({ key, value, scope, effective_from, created_by });
  }

  list(params?: { key?: string; status?: "ACTIVE" | "ARCHIVED" }) {
    return financeRulesRepo.listFinanceRules(params);
  }

  async ensureSeeded(created_by: number) {
    const existing = await financeRulesRepo.listFinanceRules({ status: "ACTIVE", limit: 1 });
    if (existing.length > 0) return;

    const epoch = new Date("2026-01-01T00:00:00.000Z");
    for (const key of SEED_RULE_KEYS) {
      await this.setActive(key, RULE_DEFAULTS[key] as number | string, { type: "GLOBAL" }, epoch, created_by);
    }
  }
}

export const ruleEngine = new RuleEngine();

export function getRuleNumber(key: string, ctx?: RuleContext): Promise<number> {
  return ruleEngine.getNumber(key, ctx);
}

export function getWeighbridgeAnomalyThreshold(ctx?: { mineId?: number }): Promise<number> {
  return ruleEngine.getNumber("weighbridge.threshold", ctx);
}
