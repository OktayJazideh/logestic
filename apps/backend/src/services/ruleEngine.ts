import * as financeRulesRepo from "../repositories/financeRulesRepository";
import type { FinanceRuleRow, FinanceRuleScope, FinanceRuleScopeType } from "../repositories/financeRulesRepository";
import { computePeriodKey } from "../lib/periodKey";
import { SEED_FINANCE_RULES, SEED_RULE_KEYS } from "../lib/seedFinanceRules";

export type RuleContext = {
  mineId?: number;
  cooperativeId?: number;
  at?: Date;
};

export class RuleNotConfiguredError extends Error {
  readonly code = "rule_not_configured";

  constructor(public readonly key: string) {
    super(`Finance rule not configured: ${key}`);
    this.name = "RuleNotConfiguredError";
  }
}

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
    return null;
  }

  async getNumber(key: string, ctx?: RuleContext): Promise<number> {
    const raw = await this.get(key, ctx);
    const n = parseNumericValue(raw);
    if (n != null) return n;
    throw new RuleNotConfiguredError(key);
  }

  /** Operational split only (owner + platform). Owner defaults to 1 − platform when unset in DB. */
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
    if (days <= 0) throw new RuleNotConfiguredError("settlement.period_days");
    return computePeriodKey(at, days);
  }

  /** SET-CYCLE-1: owner weekly settlement window from finance_rules. */
  async getOwnerPeriodDays(ctx?: RuleContext): Promise<number> {
    const days = await this.getNumber("settlement.owner_period_days", ctx);
    if (days <= 0) throw new RuleNotConfiguredError("settlement.owner_period_days");
    return days;
  }

  async setActive(
    key: string,
    value: unknown,
    scope: FinanceRuleScope,
    effective_from: Date,
    created_by: number,
    effective_to?: Date | null,
  ): Promise<{ activated: FinanceRuleRow; archived: FinanceRuleRow[] }> {
    return financeRulesRepo.setActiveFinanceRule({
      key,
      value,
      scope,
      effective_from,
      effective_to,
      created_by,
    });
  }

  list(params?: {
    key?: string;
    status?: "ACTIVE" | "ARCHIVED";
    scope_type?: FinanceRuleScopeType;
    mine_id?: number;
    cooperative_id?: number;
  }) {
    return financeRulesRepo.listFinanceRules(params);
  }

  async ensureSeeded(created_by: number) {
    const existing = await financeRulesRepo.listFinanceRules({ status: "ACTIVE", limit: 1 });
    if (existing.length > 0) return;

    const epoch = new Date("2026-01-01T00:00:00.000Z");
    for (const key of SEED_RULE_KEYS) {
      await this.setActive(
        key,
        SEED_FINANCE_RULES[key] as number | string,
        { type: "GLOBAL" },
        epoch,
        created_by,
      );
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
