import { loadMineFinanceConfig } from "./mineSettingsService";
import { ruleEngine, type RuleContext } from "./ruleEngine";

export type PlatformFeeMode = "PERCENTAGE_OF_OPERATIONAL_PAYMENT";
export type CommunityContributionMode = "FIXED_RIAL_PER_UNIT" | "PERCENTAGE_OF_OPERATIONAL";
export type CommunityContributionBase = "VERIFIED_NET_TONNAGE" | "OPERATIONAL_PAYMENT";

export type FinancePolicy = {
  platform_fee_mode: PlatformFeeMode;
  platform_fee_base: "OPERATIONAL_PAYMENT";
  platform_fee_value: number;
  community_contribution_mode: CommunityContributionMode;
  community_contribution_base: CommunityContributionBase;
  community_contribution_value: number;
};

export type FinancePolicyContext = RuleContext & {
  operationalPayment?: number;
  /** Defaults to HAUL_TONNAGE when resolving service_contracts. */
  operationTypeCode?: string;
};

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

/**
 * Core Stable, Policy Flexible — per-mine finance policy from mine + active service contract.
 * Community is never deducted from operational_payment in splitOperational.
 */
export async function resolveFinancePolicy(
  mineId: number,
  ctx?: FinancePolicyContext,
): Promise<FinancePolicy> {
  const ruleCtx: RuleContext = { mineId, cooperativeId: ctx?.cooperativeId, at: ctx?.at };
  const cfg = await loadMineFinanceConfig(mineId, {
    cooperative_id: ctx?.cooperativeId,
    operation_type_code: ctx?.operationTypeCode,
  });

  let community_contribution_mode: CommunityContributionMode = "FIXED_RIAL_PER_UNIT";
  let community_contribution_base: CommunityContributionBase = "VERIFIED_NET_TONNAGE";
  let community_contribution_value = cfg.community_rial_per_ton;

  if (cfg.allow_legacy_community_percent) {
    const legacyRaw = await ruleEngine.get("community.percent_of_operational", ruleCtx);
    const legacyPct = parseNumericValue(legacyRaw);
    if (legacyPct != null && legacyPct > 0) {
      community_contribution_mode = "PERCENTAGE_OF_OPERATIONAL";
      community_contribution_base = "OPERATIONAL_PAYMENT";
      community_contribution_value = legacyPct;
    }
  }

  return {
    platform_fee_mode: "PERCENTAGE_OF_OPERATIONAL_PAYMENT",
    platform_fee_base: "OPERATIONAL_PAYMENT",
    platform_fee_value: cfg.platform_fee_value,
    community_contribution_mode,
    community_contribution_base,
    community_contribution_value,
  };
}

export function splitOperationalWithPolicy(
  totalFare: number,
  policy: FinancePolicy,
): { totalFare: number; ownerAmount: number; platformAmount: number } {
  const platformAmount = Math.round(totalFare * policy.platform_fee_value);
  const ownerAmount = totalFare - platformAmount;
  return { totalFare, ownerAmount, platformAmount };
}

export function computeCommunityContributionWithPolicy(
  netTonsKg: number,
  policy: FinancePolicy,
  operationalPayment?: number,
): number {
  if (policy.community_contribution_mode === "PERCENTAGE_OF_OPERATIONAL") {
    const op = operationalPayment ?? 0;
    return Math.round(op * policy.community_contribution_value);
  }
  const tons = netTonsKg / 1000;
  return Math.round(tons * policy.community_contribution_value);
}
