import { prisma } from "../db/prisma";
import { toBig } from "../repositories/id";
import { resolveCommunityFixedRialPerUnit } from "./financePolicyResolver";
import { ruleEngine, type RuleContext } from "./ruleEngine";

export type PlatformFeeMode = "PERCENTAGE_OF_OPERATIONAL_PAYMENT";
export type CommunityContributionMode = "FIXED_RIAL_PER_UNIT" | "PERCENTAGE_OF_OPERATIONAL";
export type CommunityContributionBase = "VERIFIED_NET_TONNAGE" | "OPERATIONAL_PAYMENT";

/** Employer default for new mines (nullable DB → rules fallback for regression seeds). */
export const DEFAULT_PLATFORM_FEE_VALUE = 0.01;

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
 * Core Stable, Policy Flexible — per-mine finance policy from mine overrides + finance_rules.
 * Community is never deducted from operational_payment in splitOperational.
 */
export async function resolveFinancePolicy(
  mineId: number,
  ctx?: FinancePolicyContext,
): Promise<FinancePolicy> {
  const ruleCtx: RuleContext = { mineId, cooperativeId: ctx?.cooperativeId, at: ctx?.at };

  const mine = await prisma.mines.findUnique({
    where: { id: toBig(mineId) },
    select: { platform_fee_value: true, allow_legacy_community_percent: true },
  });

  let platform_fee_value: number;
  if (mine?.platform_fee_value != null) {
    platform_fee_value = Number(mine.platform_fee_value);
  } else {
    platform_fee_value = await ruleEngine.getNumber("split.platform", ruleCtx);
  }

  let community_contribution_mode: CommunityContributionMode = "FIXED_RIAL_PER_UNIT";
  let community_contribution_base: CommunityContributionBase = "VERIFIED_NET_TONNAGE";
  const communityResolved = await resolveCommunityFixedRialPerUnit(mineId, {
    ...ruleCtx,
    operationTypeCode: ctx?.operationTypeCode,
  });
  let community_contribution_value = communityResolved.fixed_rial_per_unit;
  if (communityResolved.unit !== "TON") {
    community_contribution_base = "VERIFIED_NET_TONNAGE";
  }

  if (mine?.allow_legacy_community_percent) {
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
    platform_fee_value,
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
