import type { MissionStatus, Prisma } from "@prisma/client";

import { prisma } from "../db/prisma";

import { fromDecimal, toDecimal } from "./decimal";
import { toBig, toNum } from "./id";

import * as communityPoolsRepo from "./communityPoolsRepository";

import * as walletsRepo from "./walletsRepository";

import {
  computeCommunityContributionWithPolicy,
  resolveFinancePolicy,
  splitOperationalWithPolicy,
  type FinancePolicyContext,
} from "../services/financePolicyService";
import { ruleEngine, type RuleContext } from "../services/ruleEngine";
import { FUND_TAGS } from "../types/fundAccounting";

type Tx = Prisma.TransactionClient;

export class CommunityRequiresVerifiedWeightError extends Error {
  readonly code = "community_requires_verified_weight";

  constructor() {
    super("community_requires_verified_weight");
    this.name = "CommunityRequiresVerifiedWeightError";
  }
}

export type OperationalSplitResult = {
  totalFare: number;
  ownerAmount: number;
  platformAmount: number;
};

export type MissionSplitResult = OperationalSplitResult & {
  communityAmount: number;
  verified_net_tons_kg: number;
  community_rate_rial_per_ton: number;
};

export async function computeCommunityContribution(
  netTonsKg: number,
  ctx?: FinancePolicyContext,
): Promise<number> {
  if (ctx?.mineId == null) {
    const tons = netTonsKg / 1000;
    const rialPerTon = await ruleEngine.getCommunityRialPerTon(ctx);
    return Math.round(tons * rialPerTon);
  }
  const policy = await resolveFinancePolicy(ctx.mineId, ctx);
  return computeCommunityContributionWithPolicy(netTonsKg, policy, ctx.operationalPayment);
}

export async function splitOperational(
  totalFare: number,
  ctx?: FinancePolicyContext,
): Promise<OperationalSplitResult> {
  if (ctx?.mineId == null) {
    const { owner, platform } = await ruleEngine.getSplitRatios(ctx);
    return {
      totalFare,
      ownerAmount: totalFare * owner,
      platformAmount: totalFare * platform,
    };
  }
  const policy = await resolveFinancePolicy(ctx.mineId, ctx);
  return splitOperationalWithPolicy(totalFare, policy);
}

/**
 * Mission split after VERIFIED (ACC-FUND-1 fund_type on wallet txs):
 * - OPERATIONAL / OPERATIONAL_LEDGER — owner share; operational settlement (cooperative-internal), not platform paying fare
 * - PLATFORM_REVENUE / PLATFORM_LEDGER — Platform Service Fee (e.g. 1% of fare)
 * - Community tons × rate → community_pools only (COMMUNITY_RESTRICTED on POOL_DISTRIBUTION in communityPoolsRepository)
 */
export async function applyMissionSplitInTx(
  tx: Tx,
  params: {
    mission_id: number;
    mine_id: number;
    period_key: string;
    totalFare: number;
    verified_net_tons_kg: number | null | undefined;
    owner_id: number;
    household_id: number;
    owner_active: boolean;
    household_active: boolean;
    at?: Date;
    cooperative_id?: number;
  },
): Promise<MissionSplitResult> {
  if (params.verified_net_tons_kg == null || params.verified_net_tons_kg <= 0) {
    throw new CommunityRequiresVerifiedWeightError();
  }

  const ruleCtx: FinancePolicyContext = {
    mineId: params.mine_id,
    cooperativeId: params.cooperative_id,
    at: params.at,
    operationalPayment: params.totalFare,
  };

  const policy = await resolveFinancePolicy(params.mine_id, ruleCtx);
  const { totalFare, ownerAmount, platformAmount } = splitOperationalWithPolicy(params.totalFare, policy);
  const community_rate_rial_per_ton =
    policy.community_contribution_mode === "FIXED_RIAL_PER_UNIT"
      ? policy.community_contribution_value
      : 0;
  const communityAmount = computeCommunityContributionWithPolicy(
    params.verified_net_tons_kg,
    policy,
    params.totalFare,
  );

  const platformWallet = await walletsRepo.findOrCreatePlatformWallet(tx);

  if (params.owner_active && ownerAmount !== 0) {
    const ownerWallet = await walletsRepo.findOrCreateOwnerWallet(params.owner_id, tx);
    await walletsRepo.createTransaction(
      {
        wallet_id: ownerWallet.id,
        mission_id: params.mission_id,
        amount: ownerAmount,
        type: "CREDIT",
        description: "OPERATIONAL_SPLIT:OWNER", // OPERATIONAL — operational settlement lane
        ...FUND_TAGS.operational,
      },
      tx,
    );
  }

  if (platformAmount !== 0) {
    await walletsRepo.createTransaction(
      {
        wallet_id: platformWallet.id,
        mission_id: params.mission_id,
        amount: platformAmount,
        type: "CREDIT",
        description: "OPERATIONAL_SPLIT:PLATFORM", // PLATFORM_REVENUE — Platform Service Fee
        ...FUND_TAGS.platformRevenue,
      },
      tx,
    );
  }

  if (params.household_active && communityAmount !== 0) {
    const pool = await communityPoolsRepo.getOrCreateOpenPool(params.mine_id, params.period_key, tx);
    await communityPoolsRepo.addToPoolTotal(pool.id, communityAmount, tx);
  }

  await tx.missions.update({
    where: { id: toBig(params.mission_id) },
    data: {
      verified_net_tons_kg: toDecimal(params.verified_net_tons_kg),
      community_contribution_rial: toDecimal(communityAmount),
      community_rate_rial_per_ton: toDecimal(community_rate_rial_per_ton),
    },
  });

  return {
    totalFare,
    ownerAmount,
    platformAmount,
    communityAmount,
    verified_net_tons_kg: params.verified_net_tons_kg,
    community_rate_rial_per_ton,
  };
}

/** Fare delta: owner/platform wallets; community delta → pool only (from net kg delta). */
export async function applyFareDeltaInTx(
  tx: Tx,
  params: {
    mission_id: number;
    mine_id: number;
    period_key: string;
    delta_total_fare: number;
    delta_verified_net_kg?: number;
    owner_id: number;
    household_id: number;
    owner_active: boolean;
    household_active: boolean;
    at?: Date;
    cooperative_id?: number;
  },
): Promise<{
  deltaOwner: number;
  deltaPlatform: number;
  deltaCommunity: number;
}> {
  const ruleCtx: FinancePolicyContext = {
    mineId: params.mine_id,
    cooperativeId: params.cooperative_id,
    at: params.at,
    operationalPayment: params.delta_total_fare,
  };

  const d = params.delta_total_fare;
  let ownerAmount = 0;
  let platformAmount = 0;
  if (d !== 0) {
    const policy = await resolveFinancePolicy(params.mine_id, ruleCtx);
    ({ ownerAmount, platformAmount } = splitOperationalWithPolicy(d, policy));
  }

  let deltaCommunity = 0;
  if (params.delta_verified_net_kg != null && params.delta_verified_net_kg !== 0) {
    deltaCommunity = await computeCommunityContribution(params.delta_verified_net_kg, ruleCtx);
  }

  if (d === 0 && deltaCommunity === 0) {
    return { deltaOwner: 0, deltaPlatform: 0, deltaCommunity: 0 };
  }

  const typeFor = (amt: number) => (amt >= 0 ? "CREDIT" : "DEBIT");
  const abs = (amt: number) => Math.abs(amt);

  const platformWallet = await walletsRepo.findOrCreatePlatformWallet(tx);

  if (params.owner_active && ownerAmount !== 0) {
    const ownerWallet = await walletsRepo.findOrCreateOwnerWallet(params.owner_id, tx);
    await walletsRepo.createTransaction(
      {
        wallet_id: ownerWallet.id,
        mission_id: params.mission_id,
        amount: abs(ownerAmount),
        type: typeFor(ownerAmount),
        description: "OPERATIONAL_SPLIT:OWNER_ADJ",
        ...FUND_TAGS.operational,
      },
      tx,
    );
  }

  if (platformAmount !== 0) {
    await walletsRepo.createTransaction(
      {
        wallet_id: platformWallet.id,
        mission_id: params.mission_id,
        amount: abs(platformAmount),
        type: typeFor(platformAmount),
        description: "OPERATIONAL_SPLIT:PLATFORM_ADJ",
        ...FUND_TAGS.platformRevenue,
      },
      tx,
    );
  }

  if (params.household_active && deltaCommunity !== 0) {
    const pool = await communityPoolsRepo.getOrCreateOpenPool(params.mine_id, params.period_key, tx);
    await communityPoolsRepo.addToPoolTotal(pool.id, deltaCommunity, tx);
  }

  return { deltaOwner: ownerAmount, deltaPlatform: platformAmount, deltaCommunity };
}

export async function applyHourlySplitInTx(
  tx: Tx,
  params: {
    mission_id?: number;
    mine_id: number;
    hourly_work_log_id: number;
    period_key: string;
    totalFare: number;
    owner_id: number;
    owner_active: boolean;
    at?: Date;
    cooperative_id?: number;
  },
): Promise<OperationalSplitResult> {
  const ruleCtx: RuleContext = {
    mineId: params.mine_id,
    cooperativeId: params.cooperative_id,
    at: params.at,
  };

  const { totalFare, ownerAmount, platformAmount } = await splitOperational(params.totalFare, ruleCtx);
  const mid = params.mission_id;
  const hid = params.hourly_work_log_id;
  const platformWallet = await walletsRepo.findOrCreatePlatformWallet(tx);

  if (params.owner_active && ownerAmount !== 0) {
    const ownerWallet = await walletsRepo.findOrCreateOwnerWallet(params.owner_id, tx);
    await walletsRepo.createTransaction(
      {
        wallet_id: ownerWallet.id,
        mission_id: mid,
        amount: ownerAmount,
        type: "CREDIT",
        description: `OPERATIONAL_SPLIT:HOURLY_OWNER#${hid}`,
        ...FUND_TAGS.operational,
      },
      tx,
    );
  }

  if (platformAmount !== 0) {
    await walletsRepo.createTransaction(
      {
        wallet_id: platformWallet.id,
        mission_id: mid,
        amount: platformAmount,
        type: "CREDIT",
        description: `OPERATIONAL_SPLIT:HOURLY_PLATFORM#${hid}`,
        ...FUND_TAGS.platformRevenue,
      },
      tx,
    );
  }

  return { totalFare, ownerAmount, platformAmount };
}

/** Atomic mission split (standalone transaction). */
export async function runMissionSplitTransaction(
  params: Parameters<typeof applyMissionSplitInTx>[1],
): Promise<MissionSplitResult> {
  return prisma.$transaction((tx) => applyMissionSplitInTx(tx, params));
}

const HOLD_PERCENT = 5;

export type FinanceByLoadRow = {
  mission_id: number;
  plate: string;
  verified_net_tons: number;
  operational_fare_rial: number;
  owner_amount_rial: number;
  platform_fee_rial: number;
  community_contribution_rial: number;
  community_rate_per_ton_rial: number;
  payment_hold: boolean;
  hold_amount_rial: number;
  verified_at: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function missionOperationalFromTransactions(
  transactions: Array<{ type: string; amount: { toString(): string }; wallet: { wallet_type: string } }>,
): { owner_amount_rial: number; platform_fee_rial: number; operational_fare_rial: number } {
  let owner_amount_rial = 0;
  let platform_fee_rial = 0;
  for (const t of transactions) {
    const amt = walletsRepo.transactionBalanceDelta(
      t.type as "CREDIT" | "DEBIT" | "POOL_DISTRIBUTION",
      fromDecimal(t.amount),
    );
    if (t.wallet.wallet_type === "OWNER") owner_amount_rial += amt;
    if (t.wallet.wallet_type === "PLATFORM") platform_fee_rial += amt;
  }
  owner_amount_rial = round2(owner_amount_rial);
  platform_fee_rial = round2(platform_fee_rial);
  return {
    owner_amount_rial,
    platform_fee_rial,
    operational_fare_rial: round2(owner_amount_rial + platform_fee_rial),
  };
}

function resolvePaymentHold(
  paymentState: string,
  ticketStatus: string | null | undefined,
): boolean {
  return paymentState === "HELD" || ticketStatus === "PENDING_HOLD";
}

/** WF-FIN-LOAD-1: per-mission finance rows from ledger splits + mission ton snapshot. */
export async function listFinanceByLoadRows(params: {
  from: Date;
  to: Date;
  mineId: number;
  status?: MissionStatus;
}): Promise<FinanceByLoadRow[]> {
  const status = params.status ?? "VERIFIED";
  const missions = await prisma.missions.findMany({
    where: {
      status,
      verified_at: { gte: params.from, lt: params.to },
      load: { mine_id: toBig(params.mineId) },
    },
    include: {
      vehicle: { select: { license_plate: true } },
      transactions: { include: { wallet: { select: { wallet_type: true } } } },
      weighbridge_tickets: { select: { status: true } },
    },
    orderBy: { verified_at: "desc" },
  });

  return missions.map((m) => {
    const { owner_amount_rial, platform_fee_rial, operational_fare_rial } =
      missionOperationalFromTransactions(m.transactions);
    const netKg = m.verified_net_tons_kg != null ? fromDecimal(m.verified_net_tons_kg) : 0;
    const community_contribution_rial =
      m.community_contribution_rial != null ? round2(fromDecimal(m.community_contribution_rial)) : 0;
    const community_rate_per_ton_rial =
      m.community_rate_rial_per_ton != null ? round2(fromDecimal(m.community_rate_rial_per_ton)) : 0;
    const payment_hold = resolvePaymentHold(m.payment_state, m.weighbridge_tickets?.status);
    const hold_amount_rial = payment_hold ? round2((operational_fare_rial * HOLD_PERCENT) / 100) : 0;

    return {
      mission_id: toNum(m.id),
      plate: m.vehicle.license_plate,
      verified_net_tons: round3(netKg / 1000),
      operational_fare_rial,
      owner_amount_rial,
      platform_fee_rial,
      community_contribution_rial,
      community_rate_per_ton_rial,
      payment_hold,
      hold_amount_rial,
      verified_at: m.verified_at!.toISOString(),
    };
  });
}
