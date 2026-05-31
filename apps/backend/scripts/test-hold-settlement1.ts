/**
 * HOLD-SETTLEMENT-1: missions with payment_state HELD/FAILED or PENDING_HOLD ticket
 * are excluded from monthlyClose / ownerWeeklyClose settlement queries.
 * Run 3x: npm run test:hold-settlement1
 * Requires: DATABASE_URL, db:migrate, db:seed (at least one VERIFIED mission).
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { initAppContext } from "../src/lib/appInit";
import * as settlementRepo from "../src/repositories/settlementRepository";
import { missionEligibleForSettlementWhere } from "../src/lib/settlementEligibility";
import { toBig } from "../src/repositories/id";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function monthBounds(year: number, month: number) {
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { periodStart, periodEnd };
}

async function ensureEligibleMission(mineId: number, year: number, month: number) {
  const { periodStart, periodEnd } = monthBounds(year, month);
  let missions = await prisma.missions.findMany({
    where: {
      ...missionEligibleForSettlementWhere(),
      load: { mine_id: toBig(mineId) },
      verified_at: { gte: periodStart, lte: periodEnd },
    },
    select: { id: true, payment_state: true },
    take: 5,
  });

  if (missions.length > 0) return missions[0];

  const any = await prisma.missions.findFirst({
    where: { status: "VERIFIED", load: { mine_id: toBig(mineId) } },
    orderBy: { verified_at: "desc" },
  });
  assert(any != null, "need at least one VERIFIED mission — run db:seed and a haul verify flow");

  const midMonth = new Date(Date.UTC(year, month - 1, 15, 12, 0, 0));
  await prisma.missions.update({
    where: { id: any.id },
    data: { verified_at: midMonth, payment_state: "OPEN" },
  });

  missions = await prisma.missions.findMany({
    where: {
      ...missionEligibleForSettlementWhere(),
      load: { mine_id: toBig(mineId) },
      verified_at: { gte: periodStart, lte: periodEnd },
      id: any.id,
    },
    select: { id: true, payment_state: true },
  });
  assert(missions.length === 1, "failed to prepare eligible mission in current period");
  return missions[0];
}

async function clearPeriodBatches(mineId: number, year: number, month: number) {
  const { periodStart } = monthBounds(year, month);
  const batches = await prisma.settlement_batches.findMany({
    where: { mine_id: toBig(mineId), period_start: periodStart },
    select: { id: true },
  });
  for (const b of batches) {
    await prisma.settlement_batch_approvals.deleteMany({ where: { settlement_batch_id: b.id } });
  }
  await prisma.settlement_batches.deleteMany({
    where: { mine_id: toBig(mineId), period_start: periodStart },
  });
}

async function runOnce(run: number) {
  await initAppContext();
  const mineId = 1;
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const target = await ensureEligibleMission(mineId, year, month);
  const missionId = Number(target.id);
  const prevPaymentState = target.payment_state;

  await clearPeriodBatches(mineId, year, month);

  const beforeHold = await settlementRepo.monthlyClose({ mine_id: mineId, year, month });
  assert(beforeHold.ok, `run ${run}: monthlyClose before hold: ${JSON.stringify(beforeHold)}`);
  const idsBefore = beforeHold.lines.map((l) => l.mission_id).filter((id): id is number => id != null);
  const hadTarget = idsBefore.includes(missionId);

  await prisma.missions.update({
    where: { id: toBig(missionId) },
    data: { payment_state: "HELD" },
  });

  const eligibleWhileHeld = await prisma.missions.count({
    where: { ...missionEligibleForSettlementWhere(), id: toBig(missionId) },
  });
  assert(eligibleWhileHeld === 0, `run ${run}: HELD mission must not match eligibility filter`);

  await clearPeriodBatches(mineId, year, month);
  const afterHold = await settlementRepo.monthlyClose({ mine_id: mineId, year, month });
  assert(afterHold.ok, `run ${run}: monthlyClose after HELD failed`);
  const idsAfter = afterHold.lines.map((l) => l.mission_id).filter((id): id is number => id != null);
  assert(!idsAfter.includes(missionId), `run ${run}: HELD mission ${missionId} must be excluded`);

  if (hadTarget) {
    assert(idsAfter.length < idsBefore.length, `run ${run}: settlement line count should decrease after HELD`);
  }

  await prisma.missions.update({
    where: { id: toBig(missionId) },
    data: { payment_state: prevPaymentState },
  });

  const ticket = await prisma.weighbridge_tickets.findFirst({
    where: { mission_id: toBig(missionId) },
  });
  if (ticket) {
    const prevTicketStatus = ticket.status;
    await prisma.weighbridge_tickets.update({
      where: { id: ticket.id },
      data: { status: "PENDING_HOLD" },
    });

    const eligiblePendingHold = await prisma.missions.count({
      where: { ...missionEligibleForSettlementWhere(), id: toBig(missionId) },
    });
    assert(eligiblePendingHold === 0, `run ${run}: PENDING_HOLD ticket must exclude mission`);

    await clearPeriodBatches(mineId, year, month);
    const afterPendingHold = await settlementRepo.monthlyClose({ mine_id: mineId, year, month });
    assert(afterPendingHold.ok, `run ${run}: monthlyClose with PENDING_HOLD failed`);
    const idsPending = afterPendingHold.lines
      .map((l) => l.mission_id)
      .filter((id): id is number => id != null);
    assert(!idsPending.includes(missionId), `run ${run}: PENDING_HOLD mission must be excluded from lines`);

    await prisma.weighbridge_tickets.update({
      where: { id: ticket.id },
      data: { status: prevTicketStatus },
    });
  }

  await clearPeriodBatches(mineId, year, month);
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
    console.log(`run ${run}: ok`);
  }
  console.log("test-hold-settlement1: all runs passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
