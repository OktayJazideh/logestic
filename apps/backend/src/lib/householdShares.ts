import { prisma } from "../db/prisma";
import { fromDecimal } from "../repositories/decimal";
import { toBig, toNum } from "../repositories/id";
import * as communityPoolsRepo from "../repositories/communityPoolsRepository";
import * as householdsRepo from "../repositories/householdsRepository";
import * as walletsRepo from "../repositories/walletsRepository";
import { ruleEngine } from "../services/ruleEngine";

export type HouseholdShareItem = {
  source: "POOL_DISTRIBUTION" | "MISSION_CONTRIBUTION";
  mission_id: number | null;
  amount_rial: number;
  status: "CALCULATED" | "PAID";
  paid_at: string | null;
  description_fa: string;
};

export async function resolveMineIdForHousehold(
  cooperativeId?: number,
  villageId?: number,
): Promise<number | null> {
  if (cooperativeId != null) {
    const coop = await prisma.cooperatives.findUnique({ where: { id: toBig(cooperativeId) } });
    if (coop) return toNum(coop.mine_id);
  }
  if (villageId != null) {
    const village = await prisma.villages.findUnique({ where: { id: toBig(villageId) } });
    if (village) return toNum(village.mine_id);
  }
  return null;
}

async function resolvePaidStatus(
  walletId: number,
  amount: number,
): Promise<{ status: "CALCULATED" | "PAID"; paid_at: string | null }> {
  const lines = await prisma.settlement_lines.findMany({
    where: {
      wallet_id: toBig(walletId),
      note: "POOL_DISTRIBUTION",
    },
    include: {
      payment_payout: true,
      batch: { select: { status: true, paid_at: true } },
    },
    orderBy: { id: "desc" },
  });

  const line = lines.find((l) => Math.abs(fromDecimal(l.amount) - amount) < 0.02);
  if (!line) return { status: "CALCULATED", paid_at: null };

  const paid =
    line.payment_payout?.status === "COMPLETED" ||
    (line.batch.status === "SETTLED" && line.batch.paid_at != null);
  if (!paid) return { status: "CALCULATED", paid_at: null };

  const at = line.payment_payout?.completed_at ?? line.batch.paid_at;
  return { status: "PAID", paid_at: at?.toISOString() ?? null };
}

export async function getHouseholdShares(params: {
  householdId: number;
  cooperativeId?: number;
  villageId: number;
  periodKey: string;
}): Promise<{
  period_key: string;
  community_rial_per_ton: number;
  shares: HouseholdShareItem[];
  total_rial: number;
}> {
  const mineId = await resolveMineIdForHousehold(params.cooperativeId, params.villageId);
  const community_rial_per_ton = await ruleEngine.getCommunityRialPerTon({
    mineId: mineId ?? undefined,
    cooperativeId: params.cooperativeId,
  });

  const wallet = await walletsRepo.findWalletForHousehold(params.householdId);
  if (!wallet) {
    return { period_key: params.periodKey, community_rial_per_ton, shares: [], total_rial: 0 };
  }

  const txs = await prisma.transactions.findMany({
    where: {
      wallet_id: toBig(wallet.id),
      type: "POOL_DISTRIBUTION",
      community_pool: { period_key: params.periodKey },
    },
    orderBy: { created_at: "desc" },
  });

  const shares: HouseholdShareItem[] = [];
  for (const tx of txs) {
    const amount = fromDecimal(tx.amount);
    const paidInfo = await resolvePaidStatus(wallet.id, amount);
    shares.push({
      source: "POOL_DISTRIBUTION",
      mission_id: tx.mission_id != null ? toNum(tx.mission_id) : null,
      amount_rial: amount,
      status: paidInfo.status,
      paid_at: paidInfo.paid_at,
      description_fa: "توزیع استخر اجتماعی",
    });
  }

  const total_rial = shares.reduce((s, x) => s + x.amount_rial, 0);
  return { period_key: params.periodKey, community_rial_per_ton, shares, total_rial };
}

export async function getHouseholdPoolStatus(params: {
  cooperativeId?: number;
  villageId: number;
  periodKey: string;
}): Promise<{
  period_key: string;
  pool_total_rial: number;
  pool_status: "OPEN" | "SNAPSHOT_LOCKED" | "DISTRIBUTED";
  household_count: number;
  estimated_share_rial: number;
  distributed: boolean;
  distributed_at: string | null;
}> {
  const mineId = await resolveMineIdForHousehold(params.cooperativeId, params.villageId);
  if (mineId == null) {
    return {
      period_key: params.periodKey,
      pool_total_rial: 0,
      pool_status: "OPEN",
      household_count: 0,
      estimated_share_rial: 0,
      distributed: false,
      distributed_at: null,
    };
  }

  const pool = await communityPoolsRepo.findPoolByMinePeriod(mineId, params.periodKey);
  if (!pool) {
    const approved = await householdsRepo.listApprovedHouseholdIdsByMine(mineId);
    return {
      period_key: params.periodKey,
      pool_total_rial: 0,
      pool_status: "OPEN",
      household_count: approved.length,
      estimated_share_rial: 0,
      distributed: false,
      distributed_at: null,
    };
  }

  let household_count: number;
  if (pool.status === "SNAPSHOT_LOCKED" || pool.status === "DISTRIBUTED") {
    household_count = pool.households_snapshot.length;
  } else {
    household_count = (await householdsRepo.listApprovedHouseholdIdsByMine(mineId)).length;
  }

  const pool_total_rial = pool.total_amount;
  const estimated_share_rial = household_count > 0 ? Math.floor(pool_total_rial / household_count) : 0;

  return {
    period_key: params.periodKey,
    pool_total_rial,
    pool_status: pool.status,
    household_count,
    estimated_share_rial,
    distributed: pool.status === "DISTRIBUTED",
    distributed_at: pool.distributed_at?.toISOString() ?? null,
  };
}

export const PERIOD_KEY_RE = /^\d{4}-\d{2}$/;
