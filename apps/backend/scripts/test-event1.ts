/**
 * EVENT-1: In-process EventBus + events table + audit-only subscriber.
 * Run 3x: npm run test:event1
 * Requires: DATABASE_URL
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { appContext } from "../src/appContext";
import {
  initEventBus,
  publishEvent,
  listRecentEvents,
  registerQueueConsumer,
  registerNotificationConsumer,
  resetEventBusForTests,
  clearEventsForTests,
  clearPersistedEventsForTests,
  APP_EVENT_NAMES,
} from "../src/services/eventBus";
import { runWithEventContext } from "../src/lib/eventContext";
import * as settlementRepo from "../src/repositories/settlementRepository";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function runOnce(run: number) {
  resetEventBusForTests();
  clearEventsForTests();
  await clearPersistedEventsForTests();
  initEventBus(appContext.auditStore);

  let queueHit = 0;
  let notifHit = 0;
  registerQueueConsumer(() => {
    queueHit += 1;
  });
  registerNotificationConsumer(() => {
    notifHit += 1;
  });

  const correlationId = `event1-run-${run}-${Date.now()}`;

  await runWithEventContext({ correlationId, publishedBy: 1 }, async () => {
    await publishEvent("mission.created", { mission_id: 9000 + run, need_id: run });
    await publishEvent("payment.hold", { mission_id: 9000 + run, reason: "test_hold" });
  });

  const batch = await settlementRepo.createDraft({
    period_start: new Date(),
    period_end: new Date(),
    lines: [],
  });
  await prisma.settlement_batches.update({
    where: { id: BigInt(batch.batch.id) },
    data: { status: "READY_FOR_SETTLEMENT" },
  });
  const sent = await settlementRepo.sendToBank(batch.batch.id);
  assert(sent.ok, `run ${run}: sendToBank failed`);

  await publishEvent("settlement.failed", {
    batch_id: batch.batch.id,
    reason: `test_run_${run}`,
    manual_review: true,
  });

  const recent = listRecentEvents(20);
  assert(
    recent.some((e) => e.event_name === "mission.created"),
    `run ${run}: mission.created missing in-memory`,
  );
  assert(
    recent.some((e) => e.event_name === "settlement.in_bank_queue"),
    `run ${run}: settlement.in_bank_queue missing in-memory`,
  );

  const persisted = await prisma.events.findMany({
    orderBy: { occurred_at: "desc" },
    take: 20,
  });
  assert(persisted.length >= 4, `run ${run}: expected persisted events, got ${persisted.length}`);

  assert(
    persisted.some((e) => e.event_name === "settlement.in_bank_queue"),
    `run ${run}: settlement.in_bank_queue not in DB`,
  );

  const missionRow = persisted.find((e) => e.event_name === "mission.created");
  assert(
    missionRow!.correlation_id === correlationId,
    `run ${run}: correlation_id not propagated (got ${missionRow!.correlation_id})`,
  );
  const payload = missionRow!.payload as { mission_id?: number };
  assert(payload.mission_id === 9000 + run, `run ${run}: payload mismatch`);

  const auditCount = await prisma.audit_logs.count({
    where: { entity_type: "domain_event", action: "mission.created" },
  });
  assert(auditCount >= 1, `run ${run}: audit log for domain_event missing`);

  assert(queueHit >= 4, `run ${run}: QUEUE hook not invoked (${queueHit})`);
  assert(notifHit >= 4, `run ${run}: NOTIF hook not invoked (${notifHit})`);

  assert(
    APP_EVENT_NAMES.length >= 21,
    `run ${run}: expected >=21 canonical event names, got ${APP_EVENT_NAMES.length}`,
  );
  assert(
    new Set(APP_EVENT_NAMES).size === APP_EVENT_NAMES.length,
    `run ${run}: duplicate entries in APP_EVENT_NAMES`,
  );

  await prisma.settlement_batches.delete({ where: { id: BigInt(batch.batch.id) } });
  await prisma.events.deleteMany({
    where: { correlation_id: correlationId },
  });

  console.log(`EVENT-1 run ${run}: OK (persisted=${persisted.length}, queue=${queueHit}, notif=${notifHit})`);
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  console.log("test:event1 — all 3 runs passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
