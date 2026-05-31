/**
 * POOL-1: community pool distribution after ton-based contributions (COMM-TON-1 model).
 * Pool built from 2 missions × (10t × 500k Rial/t) = 10M; 3 households → 3_333_333 each + remainder.
 * Run 3x: npm run test:pool1
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import * as communityPoolsRepo from "../src/repositories/communityPoolsRepository";
import * as householdsRepo from "../src/repositories/householdsRepository";
import * as usersRepo from "../src/repositories/usersRepository";
import { computeCommunityContribution } from "../src/repositories/financeLedgerRepository";
import { ruleEngine } from "../src/services/ruleEngine";
import { toDecimal } from "../src/repositories/decimal";

const MINE_ID = 1;
const RATE = 500_000;
const TONS_PER_MISSION_KG = 10_000;

async function ensureRules() {
  const admin = await prisma.users.findFirst({ where: { mobile_number: "09000000000" } });
  const uid = admin ? Number(admin.id) : 1;
  const epoch = new Date("2026-01-01T00:00:00.000Z");
  const scope = { type: "GLOBAL" as const };
  await ruleEngine.setActive("community.rial_per_verified_ton", RATE, scope, epoch, uid);
}

async function ensureThreeApprovedHouseholds(run: number): Promise<number[]> {
  const existing = await householdsRepo.listApprovedHouseholdIdsByMine(MINE_ID);
  const ids = [...existing];
  for (let i = ids.length; i < 3; i++) {
    const mobile = `09000002${run}${i}`;
    const u = await usersRepo.upsertUserByMobile(mobile, "HOUSEHOLD", { is_active: true });
    const h = await householdsRepo.upsertHousehold({
      user_id: u.id,
      village_id: 1,
      cooperative_id: 1,
      head_name: `خانوار تست ${run}-${i}`,
      national_id: `POOL${run}${i}${Date.now()}`.slice(0, 10),
      status: "APPROVED",
    });
    ids.push(h.id);
  }
  return ids.slice(0, 3);
}

async function poolDistributionTotal(poolId: number, householdId: number): Promise<number> {
  const w = await prisma.wallets.findFirst({
    where: { wallet_type: "HOUSEHOLD", household_id: BigInt(householdId) },
  });
  if (!w) return 0;
  const txs = await prisma.transactions.findMany({
    where: {
      wallet_id: w.id,
      community_pool_id: BigInt(poolId),
      type: "POOL_DISTRIBUTION",
    },
  });
  return txs.reduce((s, t) => s + Number(t.amount), 0);
}

async function runOnce(run: number) {
  await ensureRules();
  const householdIds = await ensureThreeApprovedHouseholds(run);
  const periodKey = `2026-05-pool-${run}`;
  const ctx = { mineId: MINE_ID, at: new Date() };

  await prisma.community_pools.deleteMany({
    where: { mine_id: BigInt(MINE_ID), period_key: periodKey },
  });

  const perMission = await computeCommunityContribution(TONS_PER_MISSION_KG, ctx);
  const poolTotal = perMission * 2;
  if (perMission !== 5_000_000 || poolTotal !== 10_000_000) {
    throw new Error(`run ${run}: expected 5M per mission / 10M pool, got ${perMission}/${poolTotal}`);
  }

  const pool = await prisma.community_pools.create({
    data: {
      mine_id: BigInt(MINE_ID),
      period_key: periodKey,
      total_amount: toDecimal(poolTotal),
      status: "OPEN",
      households_snapshot: [],
    },
  });
  const poolId = Number(pool.id);

  const dist = await communityPoolsRepo.distributePool(poolId, new Date("2026-05-31T23:59:59.000Z"));
  if (!dist.ok) throw new Error(`run ${run}: distribute failed: ${dist.reason}`);

  const expectedPer = Math.floor(poolTotal / 3);
  const expectedRemainder = poolTotal - expectedPer * 3;

  if (dist.per_household_amount !== expectedPer) {
    throw new Error(`run ${run}: expected per_household ${expectedPer}, got ${dist.per_household_amount}`);
  }
  if (dist.remainder !== expectedRemainder) {
    throw new Error(`run ${run}: expected remainder ${expectedRemainder}, got ${dist.remainder}`);
  }
  if (dist.household_count !== 3) {
    throw new Error(`run ${run}: expected 3 households, got ${dist.household_count}`);
  }

  for (const hid of householdIds) {
    const amt = await poolDistributionTotal(poolId, hid);
    if (amt !== expectedPer) {
      throw new Error(`run ${run}: household ${hid} expected ${expectedPer} POOL_DISTRIBUTION, got ${amt}`);
    }
  }

  const poolTxCount = await prisma.transactions.count({
    where: { community_pool_id: BigInt(poolId), type: "POOL_DISTRIBUTION" },
  });
  if (poolTxCount !== 3) {
    throw new Error(`run ${run}: expected 3 POOL_DISTRIBUTION txs, got ${poolTxCount}`);
  }

  if (expectedRemainder > 0) {
    const remTx = await prisma.transactions.findFirst({
      where: { community_pool_id: BigInt(poolId), description: { contains: "POOL_REMAINDER" } },
    });
    if (!remTx || Number(remTx.amount) !== expectedRemainder) {
      throw new Error(`run ${run}: POOL_REMAINDER tx missing or wrong amount`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `Run ${run} OK — pool=${poolId} total=${poolTotal} (2×${perMission} ton-based) per=${dist.per_household_amount} rem=${dist.remainder}`,
  );
}

async function main() {
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  // eslint-disable-next-line no-console
  console.log("POOL-1 test (ton-based pool): 3/3 passed");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
