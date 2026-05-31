import type { JobHandler } from "../types";
import { runMonthlyClose, runDistributePool, runExportExcel, runExecutePayouts, runDailyCycleCron } from "./settlementJobs";
import { runPush, runSms, runInApp } from "./notificationJobs";
import { runNightlyReconciliation } from "./reconciliationJobs";
import { runPersistEvent } from "./eventLogJobs";
import { runDailyKpiSnapshot } from "./kpiJobs";

const handlers: Record<string, JobHandler> = {
  "settlement:monthly-close": runMonthlyClose,
  "settlement:distribute-pool": runDistributePool,
  "settlement:export-excel": runExportExcel,
  "settlement:execute-payouts": runExecutePayouts,
  "settlement:daily-cycle-cron": runDailyCycleCron,
  "notification:push": runPush,
  "notification:sms": runSms,
  "notification:in-app": runInApp,
  "reconciliation:nightly-run": runNightlyReconciliation,
  "event_log:persist-event": runPersistEvent,
  "kpi:daily-snapshot": runDailyKpiSnapshot,
};

export function getJobHandler(queue: string, jobName: string): JobHandler | undefined {
  return handlers[`${queue}:${jobName}`];
}

const originalHandlers: Record<string, JobHandler> = {};

export function registerTestJobHandler(queue: string, jobName: string, handler: JobHandler) {
  const key = `${queue}:${jobName}`;
  if (!originalHandlers[key] && handlers[key]) originalHandlers[key] = handlers[key]!;
  handlers[key] = handler;
}

export function unregisterTestJobHandler(queue: string, jobName: string) {
  const key = `${queue}:${jobName}`;
  if (originalHandlers[key]) {
    handlers[key] = originalHandlers[key];
    delete originalHandlers[key];
  }
}
