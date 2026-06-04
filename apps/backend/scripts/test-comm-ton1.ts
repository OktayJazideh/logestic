/**
 * COMM-TON-1: operational vs community economy (tons × rate, independent of fare).
 * Run 3x: npm run test:comm-ton1
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import {
  computeCommunityContribution,
  splitOperational,
} from "../src/repositories/financeLedgerRepository";
import * as communityPoolsRepo from "../src/repositories/communityPoolsRepository";
import * as householdsRepo from "../src/repositories/householdsRepository";
import * as usersRepo from "../src/repositories/usersRepository";
import { toDecimal } from "../src/repositories/decimal";

const MINE_ID = 1;
const PERIOD_KEY = "2026-05";
const RATE = 500_000;
const TONS_KG = 20_000;

async function ensureMineFinanceFixture(platformFee = 0.02) {
  await prisma.mines.update({
    where: { id: BigInt(MINE_ID) },
    data: { platform_fee_value: platformFee, allow_legacy_community_percent: false },
  });
  const contract = await prisma.service_contracts.findFirst({
    where: {
      mine_id: BigInt(MINE_ID),
      cooperative_id: BigInt(1),
      operation_type_code: "HAUL_TONNAGE",
      status: "ACTIVE",
    },
  });
  if (contract) {
    await prisma.service_contracts.update({
      where: { id: contract.id },
      data: { fixed_community_amount_rial_per_unit: RATE },
    });
  }
}

async function scenario1(run: number) {
  const ctx = { mineId: MINE_ID, at: new Date() };
  const communityA = await computeCommunityContribution(TONS_KG, ctx);
  const communityB = await computeCommunityContribution(TONS_KG, ctx);
  const expected = 20 * RATE;
  if (communityA !== expected || communityB !== expected) {
    throw new Error(`run ${run} s1: expected community ${expected}, got ${communityA}/${communityB}`);
  }

  const opA = await splitOperational(1_000_000, ctx);
  const opB = await splitOperational(2_000_000, ctx);
  if (communityA !== communityB) {
    throw new Error(`run ${run} s1: community must not change when fare doubles`);
  }
  if (Math.abs(opA.platformAmount - 20_000) > 0.01 || Math.abs(opB.platformAmount - 40_000) > 0.01) {
    throw new Error(`run ${run} s1: platform fee should scale with operational fare`);
  }
  // eslint-disable-next-line no-console
  console.log(`run ${run} scenario 1 OK — community=${communityA} (fare-independent)`);
}

async function scenario2(run: number) {
  const ctx = { mineId: MINE_ID, at: new Date() };
  const fare = 1_000_000;
  const { ownerAmount, platformAmount } = await splitOperational(fare, ctx);
  const community = await computeCommunityContribution(TONS_KG, ctx);
  const platformOnFareOnly = fare * 0.02;
  const platformIfTaxedOnBoth = (fare + community) * 0.02;
  if (Math.abs(ownerAmount + platformAmount - fare) > 0.01) {
    throw new Error(`run ${run} s2: operational parts must sum to fare`);
  }
  if (Math.abs(platformAmount - platformOnFareOnly) > 0.01) {
    throw new Error(`run ${run} s2: platform fee must be 2% of fare only`);
  }
  if (Math.abs(platformAmount - platformIfTaxedOnBoth) < 0.01) {
    throw new Error(`run ${run} s2: platform fee must not include community amount`);
  }
  // eslint-disable-next-line no-console
  console.log(`run ${run} scenario 2 OK — platform=${platformAmount} on fare only, community=${community} untaxed`);
}

async function ensureThreeApprovedHouseholds(run: number): Promise<number[]> {
  const existing = await householdsRepo.listApprovedHouseholdIdsByMine(MINE_ID);
  const ids = [...existing];
  for (let i = ids.length; i < 3; i++) {
    const mobile = `09000003${run}${i}`;
    const u = await usersRepo.upsertUserByMobile(mobile, "HOUSEHOLD", { is_active: true });
    const h = await householdsRepo.upsertHousehold({
      user_id: u.id,
      village_id: 1,
      cooperative_id: 1,
      head_name: `خانوار comm ${run}-${i}`,
      national_id: `CT${run}${i}${Date.now()}`.slice(0, 10),
      status: "APPROVED",
    });
    ids.push(h.id);
  }
  return ids.slice(0, 3);
}

async function scenario3(run: number) {
  const householdIds = await ensureThreeApprovedHouseholds(run);
  await prisma.community_pools.deleteMany({
    where: { mine_id: BigInt(MINE_ID), period_key: `${PERIOD_KEY}-s3-${run}` },
  });

  const ctx = { mineId: MINE_ID, at: new Date() };
  const perMission = await computeCommunityContribution(10_000, ctx);
  const pool = await prisma.community_pools.create({
    data: {
      mine_id: BigInt(MINE_ID),
      period_key: `${PERIOD_KEY}-s3-${run}`,
      total_amount: toDecimal(perMission * 2),
      status: "SNAPSHOT_LOCKED",
      households_snapshot: householdIds.slice(0, 3),
    },
  });

  const dist = await communityPoolsRepo.distributePool(Number(pool.id));
  if (!dist.ok) throw new Error(`run ${run} s3: distribute failed: ${dist.reason}`);
  if (dist.per_household_amount !== Math.floor((perMission * 2) / 3)) {
    throw new Error(`run ${run} s3: expected equal split ${Math.floor((perMission * 2) / 3)}, got ${dist.per_household_amount}`);
  }
  // eslint-disable-next-line no-console
  console.log(`run ${run} scenario 3 OK — 2×${perMission} pool, per household=${dist.per_household_amount}`);
}

/** MINE-SETTINGS-UI-1: platform fee from mines.platform_fee_value overrides rules. */
async function scenarioMinePlatformFeeOverride(run: number) {
  const prev = await prisma.mines.findUnique({
    where: { id: BigInt(MINE_ID) },
    select: { platform_fee_value: true },
  });
  try {
    await prisma.mines.update({
      where: { id: BigInt(MINE_ID) },
      data: { platform_fee_value: 0.01 },
    });
    const ctx = { mineId: MINE_ID, at: new Date() };
    const { platformAmount } = await splitOperational(1_000_000, ctx);
    if (Math.abs(platformAmount - 10_000) > 0.01) {
      throw new Error(`run ${run} s4: expected platform 10000 at 1% mine override, got ${platformAmount}`);
    }
    // eslint-disable-next-line no-console
    console.log(`run ${run} scenario 4 OK — mine platform_fee_value 1% → platform=${platformAmount}`);
  } finally {
    await prisma.mines.update({
      where: { id: BigInt(MINE_ID) },
      data: { platform_fee_value: prev?.platform_fee_value ?? null },
    });
  }
}

async function runOnce(run: number) {
  await ensureMineFinanceFixture(0.02);
  await scenario1(run);
  await scenario2(run);
  await scenarioMinePlatformFeeOverride(run);
  await scenario3(run);
}

async function main() {
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  // eslint-disable-next-line no-console
  console.log("COMM-TON-1: 3/3 runs passed (4 scenarios each, incl. mine fee override)");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
