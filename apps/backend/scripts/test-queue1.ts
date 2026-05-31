/**
 * QUEUE-1: in-memory queues, retry/backoff, failed_jobs, manual retry, event wiring.
 * Run 3x: npm run test:queue1
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { appContext } from "../src/appContext";
import { toBig, toNum } from "../src/repositories/id";
import {
  initEventBus,
  publishEvent,
  resetEventBusForTests,
  clearEventsForTests,
} from "../src/services/eventBus";
import { runWithEventContext } from "../src/lib/eventContext";
import { jobQueue } from "../src/queues/jobQueue";
import { wireQueueFromEventBus } from "../src/queues/wireEventBus";
import {
  registerTestJobHandler,
  unregisterTestJobHandler,
} from "../src/queues/handlers";
import * as failedJobsRepo from "../src/repositories/failedJobsRepository";
import {
  clearSentNotificationsForTests,
  listSentNotificationsForTests,
} from "../src/queues/handlers/notificationJobs";
import { getLastReconciliationIssues, clearReconciliationIssuesForTests } from "../src/queues/handlers/reconciliationJobs";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function testRetryAndFailedJob(run: number) {
  let attempts = 0;
  registerTestJobHandler("settlement", "monthly-close", async () => {
    attempts += 1;
    throw new Error(`always_fail_${run}`);
  });

  const job = await jobQueue.enqueue(
    "settlement",
    "monthly-close",
    { mine_id: 1, year: 2099, month: run },
    { wait: true, correlation_id: `queue1-fail-${run}` },
  );
  assert(job.status === "failed", `run ${run}: expected failed job, got ${job.status}`);
  assert(attempts === 4, `run ${run}: expected 4 attempts (1+3 retries), got ${attempts}`);

  const failed = await failedJobsRepo.listFailedJobs({ queue: "settlement" });
  const row = failed.find((f) => f.correlation_id === `queue1-fail-${run}`);
  assert(row != null, `run ${run}: failed_jobs row missing`);

  unregisterTestJobHandler("settlement", "monthly-close");
  registerTestJobHandler("settlement", "monthly-close", async () => ({ ok: true, retried: run }));

  const retried = await jobQueue.retryFailedJob(row!.id);
  const done = await jobQueue.waitForJob(retried.id, 30_000);
  assert(done.status === "completed", `run ${run}: manual retry expected completed, got ${done.status}`);

  unregisterTestJobHandler("settlement", "monthly-close");
}

async function testEventWiring(run: number) {
  clearSentNotificationsForTests();
  const driverUser = await appContext.userStore.upsertUserByMobile("09000000003", "DRIVER", { is_active: true });
  const driverRow = await prisma.drivers.upsert({
    where: { user_id: toBig(driverUser.id) },
    create: {
      user_id: toBig(driverUser.id),
      full_name: "راننده تست صف",
      status: "APPROVED",
    },
    update: {},
  });
  const driverId = toNum(driverRow.id);

  await runWithEventContext({ correlationId: `queue1-ev-${run}`, publishedBy: 1 }, async () => {
    await publishEvent("mission.assigned", { mission_id: 8000 + run, driver_id: driverId });
  });

  for (let i = 0; i < 40; i++) {
    if (jobQueue.listActive().length === 0) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  const active = jobQueue.listActive();
  assert(active.length === 0, `run ${run}: jobs still active: ${active.length}`);

  const notifs = listSentNotificationsForTests();
  assert(notifs.some((n) => n.channel === "push"), `run ${run}: push notification not sent`);
  assert(notifs.some((n) => n.channel === "sms"), `run ${run}: sms notification not sent (NOTIF-1)`);

  const eventJobs = jobQueue.listRecentCompleted(20).filter((j) => j.queue === "event_log");
  assert(eventJobs.length >= 1, `run ${run}: event_log job missing`);
}

async function testReconciliation(run: number) {
  await clearReconciliationIssuesForTests();
  const job = await jobQueue.enqueue("reconciliation", "nightly-run", { run }, { wait: true });
  assert(job.status === "completed", `run ${run}: reconciliation failed: ${job.error}`);
  const issues = await getLastReconciliationIssues();
  assert(Array.isArray(issues), `run ${run}: issues not array`);
}

async function testAsyncMonthlyClose(run: number) {
  const job = await jobQueue.enqueue(
    "settlement",
    "monthly-close",
    { mine_id: 1, year: 2090, month: run },
    { correlation_id: `queue1-async-${run}` },
  );
  assert(job.status === "queued" || job.status === "active", `run ${run}: expected queued/active, got ${job.status}`);
  const done = await jobQueue.waitForJob(job.id, 30_000);
  assert(done.status === "failed" || done.status === "completed", `run ${run}: unexpected ${done.status}`);
}

async function testExportJob(run: number) {
  const batch = await prisma.settlement_batches.create({
    data: {
      mine_id: BigInt(1),
      period_start: new Date("2098-01-01"),
      period_end: new Date("2098-01-31"),
      status: "CALCULATED",
    },
  });
  const job = await jobQueue.enqueue(
    "settlement",
    "export-excel",
    { batch_id: Number(batch.id) },
    { wait: true },
  );
  assert(job.status === "completed", `run ${run}: export job failed`);
  const result = job.result as { row_count?: number; csv?: string };
  assert(result.row_count === 0, `run ${run}: expected 0 export rows`);
  assert(typeof result.csv === "string" && result.csv.length > 0, `run ${run}: export csv missing`);
  await prisma.settlement_batches.delete({ where: { id: batch.id } });
}

async function runOnce(run: number) {
  resetEventBusForTests();
  clearEventsForTests();
  jobQueue.resetForTests();
  await failedJobsRepo.deleteAllFailedJobsForTests();
  clearSentNotificationsForTests();
  await clearReconciliationIssuesForTests();

  initEventBus(appContext.auditStore);
  wireQueueFromEventBus();

  await testRetryAndFailedJob(run);
  await testAsyncMonthlyClose(run);
  await testEventWiring(run);
  await testReconciliation(run);
  await testExportJob(run);

  console.log(`QUEUE-1 run ${run}: OK`);
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  console.log("test:queue1 — all 3 runs passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
