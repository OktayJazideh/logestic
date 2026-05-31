import type { CommunityPoolStatus, Prisma } from "@prisma/client";

import { prisma } from "../db/prisma";

import { toBig, toNum } from "./id";

import { fromDecimal, toDecimal } from "./decimal";

import * as householdsRepo from "./householdsRepository";

import * as walletsRepo from "./walletsRepository";

import { ruleEngine, type RuleContext } from "../services/ruleEngine";
import { FUND_TAGS } from "../types/fundAccounting";



export type CommunityPoolRow = {

  id: number;

  mine_id?: number;

  period_key: string;

  total_amount: number;

  status: CommunityPoolStatus;

  households_snapshot: number[];

  distributed_at?: Date;

  created_at: Date;

};



type Tx = Prisma.TransactionClient;



export type DistributePoolResult =

  | {

      ok: true;

      pool: CommunityPoolRow;

      per_household_amount: number;

      remainder: number;

      household_count: number;

    }

  | { ok: false; reason: string };



function mapPool(r: {

  id: bigint;

  mine_id: bigint | null;

  period_key: string;

  total_amount: { toString(): string };

  status: CommunityPoolStatus;

  households_snapshot: unknown;

  distributed_at: Date | null;

  created_at: Date;

}): CommunityPoolRow {

  const snap = r.households_snapshot;

  const households_snapshot = Array.isArray(snap) ? (snap as unknown[]).map((x) => Number(x)) : [];

  return {

    id: toNum(r.id),

    mine_id: r.mine_id != null ? toNum(r.mine_id) : undefined,

    period_key: r.period_key,

    total_amount: fromDecimal(r.total_amount),

    status: r.status,

    households_snapshot,

    distributed_at: r.distributed_at ?? undefined,

    created_at: r.created_at,

  };

}



export async function listCommunityPools(): Promise<CommunityPoolRow[]> {

  const rows = await prisma.community_pools.findMany({ orderBy: { created_at: "desc" } });

  return rows.map(mapPool);

}



export async function findPoolById(poolId: number): Promise<CommunityPoolRow | null> {

  const r = await prisma.community_pools.findUnique({ where: { id: toBig(poolId) } });

  return r ? mapPool(r) : null;

}



export async function findPoolByMinePeriod(mineId: number, periodKey: string): Promise<CommunityPoolRow | null> {

  const r = await prisma.community_pools.findUnique({

    where: { mine_id_period_key: { mine_id: toBig(mineId), period_key: periodKey } },

  });

  return r ? mapPool(r) : null;

}



export async function getOrCreateOpenPool(mineId: number, periodKey: string, tx: Tx): Promise<CommunityPoolRow> {

  const existing = await tx.community_pools.findUnique({

    where: { mine_id_period_key: { mine_id: toBig(mineId), period_key: periodKey } },

  });

  if (existing) return mapPool(existing);



  const r = await tx.community_pools.create({

    data: {

      mine_id: toBig(mineId),

      period_key: periodKey,

      total_amount: toDecimal(0),

      status: "OPEN",

      households_snapshot: [],

    },

  });

  return mapPool(r);

}



export async function addToPoolTotal(poolId: number, delta: number, tx: Tx): Promise<CommunityPoolRow> {

  const current = await tx.community_pools.findUniqueOrThrow({ where: { id: toBig(poolId) } });

  const next = fromDecimal(current.total_amount) + delta;

  const r = await tx.community_pools.update({

    where: { id: toBig(poolId) },

    data: { total_amount: toDecimal(next) },

  });

  return mapPool(r);

}



export async function lockPoolSnapshot(

  periodKey: string,

  mineId: number,

  householdIds: number[],

): Promise<{ ok: true; pool: CommunityPoolRow } | { ok: false; reason: string }> {

  const pool = await prisma.$transaction((tx) => getOrCreateOpenPool(mineId, periodKey, tx));

  if (pool.status === "DISTRIBUTED") return { ok: false, reason: "already_distributed" };

  const r = await prisma.community_pools.update({

    where: { id: toBig(pool.id) },

    data: {

      households_snapshot: [...new Set(householdIds)],

      status: "SNAPSHOT_LOCKED",

    },

  });

  return { ok: true, pool: mapPool(r) };

}



async function resolveSnapshot(

  tx: Tx,

  pool: CommunityPoolRow,

  at: Date,

): Promise<number[] | { ok: false; reason: string }> {

  if (pool.status === "SNAPSHOT_LOCKED" || pool.status === "DISTRIBUTED") {

    if (pool.households_snapshot.length === 0) return { ok: false, reason: "missing_snapshot_households" };

    return pool.households_snapshot;

  }

  if (pool.mine_id == null) return { ok: false, reason: "missing_mine_id" };

  const householdIds = await householdsRepo.listApprovedHouseholdIdsByMine(pool.mine_id);

  if (householdIds.length === 0) return { ok: false, reason: "no_approved_households" };

  await tx.community_pools.update({

    where: { id: toBig(pool.id) },

    data: { households_snapshot: householdIds, status: "SNAPSHOT_LOCKED" },

  });

  return householdIds;

}



async function creditPoolRemainder(

  tx: Tx,

  poolId: number,

  mineId: number | undefined,

  remainder: number,

  at: Date,

): Promise<void> {

  if (remainder <= 0) return;

  const ctx: RuleContext = { mineId, at };

  const target = String((await ruleEngine.get("pool.remainder.target", ctx)) ?? "rounding_bucket");

  const platformWallet = await walletsRepo.findOrCreatePlatformWallet(tx);

  if (target === "cooperative") {

    await walletsRepo.createTransaction(

      {

        wallet_id: platformWallet.id,

        community_pool_id: poolId,

        amount: remainder,

        type: "CREDIT",

        description: `POOL_REMAINDER_COOP#${poolId}`,

        ...FUND_TAGS.communityRestricted,

      },

      tx,

    );

  } else {

    await walletsRepo.createTransaction(

      {

        wallet_id: platformWallet.id,

        community_pool_id: poolId,

        amount: remainder,

        type: "CREDIT",

        description: `POOL_REMAINDER#${poolId}`,

        ...FUND_TAGS.communityRestricted,

      },

      tx,

    );

  }

}



/**

 * Equal split: floor(total / n) per household; remainder per Rule Engine (rounding_bucket | cooperative).

 * Auto-snapshots APPROVED households for the mine when pool is still OPEN.

 */

export async function distributePool(poolId: number, at = new Date()): Promise<DistributePoolResult> {

  const existing = await findPoolById(poolId);

  if (!existing) return { ok: false, reason: "pool_not_found" };

  if (existing.status === "DISTRIBUTED") return { ok: false, reason: "already_distributed" };



  return prisma.$transaction(async (tx) => {

    const poolRow = await tx.community_pools.findUniqueOrThrow({ where: { id: toBig(poolId) } });

    const pool = mapPool(poolRow);

    if (pool.status === "DISTRIBUTED") return { ok: false, reason: "already_distributed" };



    const snapshot = await resolveSnapshot(tx, pool, at);

    if (!Array.isArray(snapshot)) return snapshot;



    const total = fromDecimal(poolRow.total_amount);

    const n = snapshot.length;

    const per = Math.floor(total / n);

    const remainder = total - per * n;



    for (const hid of snapshot) {

      const w = await walletsRepo.findOrCreateHouseholdWallet(hid, tx);

      await walletsRepo.createTransaction(

        {

          wallet_id: w.id,

          community_pool_id: poolId,

          amount: per,

          type: "POOL_DISTRIBUTION",

          description: `POOL_DISTRIBUTION#${poolId}`,

          ...FUND_TAGS.communityRestricted,

        },

        tx,

      );

    }



    await creditPoolRemainder(tx, poolId, pool.mine_id, remainder, at);



    const updated = await tx.community_pools.update({

      where: { id: toBig(poolId) },

      data: { status: "DISTRIBUTED", distributed_at: at },

    });



    return {

      ok: true as const,

      pool: mapPool(updated),

      per_household_amount: per,

      remainder,

      household_count: n,

    };

  });

}


