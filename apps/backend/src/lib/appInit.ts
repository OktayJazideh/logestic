import { appContext } from "../appContext";
import { ruleEngine } from "../services/ruleEngine";
import { initEventBus } from "../services/eventBus";
import { prisma } from "../db/prisma";
import { wireQueueFromEventBus } from "../queues/wireEventBus";
import { jobQueue } from "../queues/jobQueue";
import { ENABLE_SLA_ESCALATION } from "./slaConfig";
import { shouldStartBackgroundJobs } from "./runtimeMode";

/**
 * SLA-ESCALATION-1 phase 2 (disabled by default):
 * Nightly: PENDING approval_tasks with due_at < now → ESCALATED + escalated_to_role + audit + notification.
 * Chain: COOP_ADMIN → OPERATION_ADMIN → ADMIN
 */
function startNightlySlaEscalation() {
  if (!ENABLE_SLA_ESCALATION) return;
  // TODO phase 2: jobQueue.enqueue("notifications", "sla-escalate-stale", { scheduled: true })
}

/** Load DB-backed master data into in-memory caches before serving traffic. */
export async function initAppContext() {
  initEventBus(appContext.auditStore);
  wireQueueFromEventBus();
  if (shouldStartBackgroundJobs()) {
    jobQueue.startNightlyReconciliation();
    jobQueue.startNightlyKpi();
    jobQueue.startDailySettlementCycle();
    startNightlySlaEscalation();
  }
  await appContext.userStore.migrateLegacyCoopRoles();
  const admin = await prisma.users.findFirst({ where: { mobile_number: "09000000000" } });
  if (admin) {
    await ruleEngine.ensureSeeded(Number(admin.id));
  }
  await Promise.all([
    appContext.mineData.hydrate(),
    appContext.entities.hydrate(),
    appContext.finance.hydrateRateCards(),
  ]);
}

/** Stop timers and DB pool — call from integration scripts so the process can exit. */
export async function shutdownAppContext() {
  jobQueue.resetForTests();
  await prisma.$disconnect();
}
