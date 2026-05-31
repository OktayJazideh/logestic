/**
 * SET-CYCLE-1: dual settlement cycles — owner weekly / household monthly.
 * Run 3x: npm run test:set-cycle1
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { ruleEngine } from "../src/services/ruleEngine";
import { runDailySettlementCycle } from "../src/services/settlementService";
import * as settlementRepo from "../src/repositories/settlementRepository";
import * as walletsRepo from "../src/repositories/walletsRepository";
import { ownerPeriodBounds, monthBoundsUtc, localDateParts } from "../src/lib/settlementCycle";
import { toDecimal } from "../src/repositories/decimal";

const MINE_ID = 1;
const MS_DAY = 86_400_000;
const PERIOD_DAYS = 7;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function ensureOwnerPeriodRule() {
  const admin = await prisma.users.findFirst({ where: { mobile_number: "09000000000" } });
  const uid = admin ? Number(admin.id) : 1;
  const epoch = new Date("2026-01-01T00:00:00.000Z");
  await ruleEngine.setActive("settlement.owner_period_days", 7, { type: "GLOBAL" }, epoch, uid);
}

async function cleanupCycleBatches(_run: number) {
  const batches = await prisma.settlement_batches.findMany({
    where: {
      mine_id: BigInt(MINE_ID),
      batch_type: { in: ["OWNER_WEEKLY", "HOUSEHOLD_MONTHLY"] },
    },
    select: { id: true },
  });
  for (const b of batches) {
    await prisma.settlement_batch_approvals.deleteMany({ where: { settlement_batch_id: b.id } });
    await prisma.payment_payouts.deleteMany({ where: { settlement_batch_id: b.id } });
    await prisma.settlement_lines.deleteMany({ where: { batch_id: b.id } });
  }
  await prisma.settlement_batches.deleteMany({
    where: {
      mine_id: BigInt(MINE_ID),
      batch_type: { in: ["OWNER_WEEKLY", "HOUSEHOLD_MONTHLY"] },
    },
  });

  const testLoads = await prisma.loads.findMany({
    where: { load_tracking_code: { startsWith: "SETCYCLE-" } },
    select: { id: true, missions: { select: { id: true } } },
  });
  const missionIds = testLoads.flatMap((l) => l.missions.map((m) => m.id));
  if (missionIds.length > 0) {
    await prisma.transactions.deleteMany({ where: { mission_id: { in: missionIds } } });
    await prisma.settlement_lines.deleteMany({ where: { mission_id: { in: missionIds } } });
    await prisma.missions.deleteMany({ where: { id: { in: missionIds } } });
  }
  await prisma.loads.deleteMany({
    where: { load_tracking_code: { startsWith: "SETCYCLE-" } },
  });
}

async function getSeedEntities() {
  const owner = await prisma.fleet_owners.findFirst({
    where: { cooperative_id: BigInt(1) },
    orderBy: { id: "asc" },
  });
  const driver = await prisma.drivers.findFirst({
    where: { cooperative_id: BigInt(1) },
    orderBy: { id: "asc" },
  });
  const vehicle = await prisma.vehicles.findFirst({
    where: { owner_id: owner!.id },
    orderBy: { id: "asc" },
  });
  const household = await prisma.households.findFirst({
    where: { cooperative_id: BigInt(1), status: "APPROVED" },
    orderBy: { id: "asc" },
  });
  if (!owner || !driver || !vehicle || !household) {
    throw new Error("seed entities missing — run npm run db:seed");
  }
  return { owner, driver, vehicle, household };
}

async function seedVerifiedMission(params: {
  run: number;
  idx: number;
  verified_at: Date;
  ownerAmount: number;
}) {
  const { owner, driver, vehicle, household } = await getSeedEntities();
  const code = `SETCYCLE-${params.run}-${params.idx}-${Date.now()}`;

  const load = await prisma.loads.create({
    data: {
      load_tracking_code: code,
      mine_id: BigInt(MINE_ID),
      household_id: household.id,
      material_type: "ORE",
      quantity_tons: 10,
      status: "DELIVERED",
    },
  });

  const mission = await prisma.missions.create({
    data: {
      load_id: load.id,
      owner_id: owner.id,
      driver_id: driver.id,
      vehicle_id: vehicle.id,
      status: "VERIFIED",
      verified_at: params.verified_at,
      verified_net_tons_kg: 10000,
    },
  });

  const wallet = await walletsRepo.findWalletForOwner(Number(owner.id));
  if (!wallet) throw new Error("owner wallet missing");

  await prisma.transactions.create({
    data: {
      wallet_id: BigInt(wallet.id),
      mission_id: mission.id,
      type: "CREDIT",
      amount: toDecimal(params.ownerAmount),
      description: `SETCYCLE owner credit ${code}`,
    },
  });

  return Number(mission.id);
}

/** Pick `at` inside bucket N+1 so cron closes bucket N. */
function cronAtAfterBucket(bucket: number): Date {
  const bucketMs = PERIOD_DAYS * MS_DAY;
  return new Date((bucket + 1) * bucketMs + 60_000);
}

async function runOnce(run: number) {
  await ensureOwnerPeriodRule();
  await cleanupCycleBatches(run);

  const bucketMs = PERIOD_DAYS * MS_DAY;
  const anchorBucket = 400 + run;
  const week1A = new Date(anchorBucket * bucketMs + 2 * MS_DAY);
  const week1B = new Date(anchorBucket * bucketMs + 5 * MS_DAY);
  const week2A = new Date((anchorBucket + 1) * bucketMs + 2 * MS_DAY);

  await seedVerifiedMission({
    run,
    idx: 1,
    verified_at: week1A,
    ownerAmount: 1_000_000 + run * 1000,
  });
  await seedVerifiedMission({
    run,
    idx: 2,
    verified_at: week1B,
    ownerAmount: 2_000_000 + run * 1000,
  });
  await seedVerifiedMission({
    run,
    idx: 3,
    verified_at: week2A,
    ownerAmount: 3_000_000 + run * 1000,
  });

  const cronWeek1 = cronAtAfterBucket(anchorBucket);
  const week1Bounds = ownerPeriodBounds(cronWeek1, PERIOD_DAYS);

  const cycle1 = await runDailySettlementCycle({ at: cronWeek1, mine_ids: [MINE_ID] });
  const mine1 = cycle1.mines[0];
  assert(!!mine1?.owner_weekly, `run ${run}: expected owner_weekly batch after week1 cron`);
  assert(mine1!.owner_weekly!.batch_type === "OWNER_WEEKLY", `run ${run}: batch_type must be OWNER_WEEKLY`);

  const batch1Id = mine1!.owner_weekly!.id;
  const lines1 = await settlementRepo.getLines(batch1Id);
  assert(lines1.length === 2, `run ${run}: week1 batch expected 2 owner lines, got ${lines1.length}`);
  assert(
    lines1.every((l) => l.note === "MISSION_OWNER"),
    `run ${run}: owner batch must not contain pool lines`,
  );

  const ownerExport1 = await settlementRepo.buildOwnerExportRows(batch1Id);
  const householdExport1 = await settlementRepo.buildHouseholdExportRows(batch1Id);
  assert(ownerExport1.length === 2, `run ${run}: export-owner must have 2 rows`);
  assert(householdExport1.length === 0, `run ${run}: export-household must be empty for owner batch`);

  const cycle1dup = await runDailySettlementCycle({ at: cronWeek1, mine_ids: [MINE_ID] });
  const weeklyCountAfterDup = await prisma.settlement_batches.count({
    where: { mine_id: BigInt(MINE_ID), batch_type: "OWNER_WEEKLY", period_start: week1Bounds.periodStart },
  });
  assert(weeklyCountAfterDup === 1, `run ${run}: idempotency failed — duplicate owner weekly batch`);
  assert(
    cycle1dup.mines[0]?.skipped?.some((s) => s.includes("owner:batch_exists_for_period")),
    `run ${run}: duplicate cron should skip owner batch`,
  );

  const cronWeek2 = cronAtAfterBucket(anchorBucket + 1);
  const cycle2 = await runDailySettlementCycle({ at: cronWeek2, mine_ids: [MINE_ID] });
  assert(
    !!cycle2.mines[0]?.owner_weekly,
    `run ${run}: expected second owner_weekly batch, skipped=${JSON.stringify(cycle2.mines[0]?.skipped)}`,
  );
  const batch2Id = cycle2.mines[0]!.owner_weekly!.id;
  assert(batch2Id !== batch1Id, `run ${run}: week2 batch must differ from week1`);
  const lines2 = await settlementRepo.getLines(batch2Id);
  assert(lines2.length === 1, `run ${run}: week2 batch expected 1 line, got ${lines2.length}`);

  const month1At = new Date(Date.UTC(2026, 4 + run, 1, 2, 0, 0));
  const local = localDateParts(month1At);
  let prevYear = local.year;
  let prevMonth = local.month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }
  const { periodEnd: prevMonthEnd } = monthBoundsUtc(prevYear, prevMonth);
  const periodKey = await ruleEngine.getPeriodKey(prevMonthEnd, { mineId: MINE_ID });

  await prisma.community_pools.deleteMany({
    where: { mine_id: BigInt(MINE_ID), period_key: periodKey },
  });
  const pool = await prisma.community_pools.create({
    data: {
      mine_id: BigInt(MINE_ID),
      period_key: periodKey,
      total_amount: toDecimal(9_000_000 + run * 1000),
      status: "OPEN",
      households_snapshot: [],
    },
  });

  const cycleMonth = await runDailySettlementCycle({ at: month1At, mine_ids: [MINE_ID] });
  const hhBatch = cycleMonth.mines[0]?.household_monthly;
  assert(!!hhBatch, `run ${run}: expected HOUSEHOLD_MONTHLY on day 1`);
  assert(hhBatch!.batch_type === "HOUSEHOLD_MONTHLY", `run ${run}: batch_type must be HOUSEHOLD_MONTHLY`);

  const hhLines = await settlementRepo.getLines(hhBatch!.id);
  assert(hhLines.length > 0, `run ${run}: household batch needs pool lines`);
  assert(
    hhLines.every((l) => l.note === "POOL_DISTRIBUTION"),
    `run ${run}: household batch must only have POOL_DISTRIBUTION lines`,
  );

  const ownerExportHh = await settlementRepo.buildOwnerExportRows(hhBatch!.id);
  const householdExportHh = await settlementRepo.buildHouseholdExportRows(hhBatch!.id);
  assert(ownerExportHh.length === 0, `run ${run}: owner export empty on household batch`);
  assert(householdExportHh.length === hhLines.length, `run ${run}: household export row count`);

  const poolRow = await prisma.community_pools.findUnique({ where: { id: pool.id } });
  assert(poolRow?.status === "DISTRIBUTED", `run ${run}: pool must be DISTRIBUTED`);

  const cycleMonthDup = await runDailySettlementCycle({ at: month1At, mine_ids: [MINE_ID] });
  const hhCount = await prisma.settlement_batches.count({
    where: { mine_id: BigInt(MINE_ID), batch_type: "HOUSEHOLD_MONTHLY", id: BigInt(hhBatch!.id) },
  });
  assert(hhCount === 1, `run ${run}: duplicate household monthly batch`);
  assert(
    cycleMonthDup.mines[0]?.skipped?.some((s) => s.includes("household:batch_exists_for_period")),
    `run ${run}: duplicate household cron should skip`,
  );

  console.log(`run ${run}: OK — owner batches ${batch1Id}/${batch2Id}, household ${hhBatch!.id}`);
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  console.log("test-set-cycle1: all 3 runs passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
