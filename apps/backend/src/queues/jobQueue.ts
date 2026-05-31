import { randomUUID } from "node:crypto";
import * as failedJobsRepo from "../repositories/failedJobsRepository";
import { getJobHandler } from "./handlers";
import {
  type EnqueueOptions,
  type JobRecord,
  type JobStatus,
  type QueueName,
  MAX_JOB_ATTEMPTS,
  backoffMs,
} from "./types";

type InternalJob = JobRecord & {
  _resolve?: (r: JobRecord) => void;
  _reject?: (e: Error) => void;
};

class InMemoryJobQueue {
  private jobs = new Map<string, InternalJob>();
  private pending: string[] = [];
  private processing = false;
  private nightlyTimeout: ReturnType<typeof setTimeout> | null = null;
  private nightlyTimer: ReturnType<typeof setInterval> | null = null;
  private kpiNightlyTimeout: ReturnType<typeof setTimeout> | null = null;
  private kpiNightlyTimer: ReturnType<typeof setInterval> | null = null;

  private settlementCycleTimeout: ReturnType<typeof setTimeout> | null = null;
  private settlementCycleTimer: ReturnType<typeof setInterval> | null = null;

  listActive(): JobRecord[] {
    return [...this.jobs.values()]
      .filter((j) => j.status === "queued" || j.status === "active")
      .map((j) => this.publicJob(j));
  }

  listRecentCompleted(limit = 50): JobRecord[] {
    return [...this.jobs.values()]
      .filter((j) => j.status === "completed")
      .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
      .slice(0, limit)
      .map((j) => this.publicJob(j));
  }

  getJob(id: string): JobRecord | undefined {
    const j = this.jobs.get(id);
    return j ? this.publicJob(j) : undefined;
  }

  async enqueue(
    queue: QueueName,
    jobName: string,
    payload: Record<string, unknown>,
    opts?: EnqueueOptions,
  ): Promise<JobRecord> {
    const id = randomUUID();
    const job: InternalJob = {
      id,
      queue,
      job_name: jobName,
      payload,
      status: "queued",
      attempts: 0,
      max_attempts: MAX_JOB_ATTEMPTS,
      correlation_id: opts?.correlation_id,
      created_at: new Date().toISOString(),
    };
    this.jobs.set(id, job);
    this.pending.push(id);

    const promise = opts?.wait
      ? new Promise<JobRecord>((resolve, reject) => {
          job._resolve = resolve;
          job._reject = reject;
        })
      : null;

    void this.pump();
    if (promise) return promise;
    return this.publicJob(job);
  }

  async retryFailedJob(failedJobId: number, opts?: { wait?: boolean }): Promise<JobRecord> {
    const failed = await failedJobsRepo.getFailedJob(failedJobId);
    if (!failed) throw new Error("failed_job_not_found");
    if (failed.status !== "failed") throw new Error("job_not_retryable");
    await failedJobsRepo.markFailedJobRetried(failedJobId);
    return this.enqueue(failed.queue_name as QueueName, failed.job_name, failed.payload, {
      correlation_id: failed.correlation_id ?? undefined,
      wait: opts?.wait ?? false,
    });
  }

  startNightlyReconciliation() {
    if (this.nightlyTimer || this.nightlyTimeout) return;
    const MS_DAY = 24 * 60 * 60 * 1000;
    const now = new Date();
    const next = new Date(now);
    next.setHours(0, 30, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const delay = next.getTime() - now.getTime();
    this.nightlyTimeout = setTimeout(() => {
      this.nightlyTimeout = null;
      void this.enqueue("reconciliation", "nightly-run", { scheduled: true });
      this.nightlyTimer = setInterval(() => {
        void this.enqueue("reconciliation", "nightly-run", { scheduled: true });
      }, MS_DAY);
    }, delay);
  }

  stopNightlyReconciliation() {
    if (this.nightlyTimeout) {
      clearTimeout(this.nightlyTimeout);
      this.nightlyTimeout = null;
    }
    if (this.nightlyTimer) {
      clearInterval(this.nightlyTimer);
      this.nightlyTimer = null;
    }
  }

  startNightlyKpi() {
    if (this.kpiNightlyTimer || this.kpiNightlyTimeout) return;
    const MS_DAY = 24 * 60 * 60 * 1000;
    const now = new Date();
    const next = new Date(now);
    next.setHours(0, 35, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const delay = next.getTime() - now.getTime();
    this.kpiNightlyTimeout = setTimeout(() => {
      this.kpiNightlyTimeout = null;
      void this.enqueue("kpi", "daily-snapshot", { scheduled: true });
      this.kpiNightlyTimer = setInterval(() => {
        void this.enqueue("kpi", "daily-snapshot", { scheduled: true });
      }, MS_DAY);
    }, delay);
  }

  stopNightlyKpi() {
    if (this.kpiNightlyTimeout) {
      clearTimeout(this.kpiNightlyTimeout);
      this.kpiNightlyTimeout = null;
    }
    if (this.kpiNightlyTimer) {
      clearInterval(this.kpiNightlyTimer);
      this.kpiNightlyTimer = null;
    }
  }

  /**
   * SET-CYCLE-1: daily 02:00 server-local time.
   * TZ for household day-1 logic is Asia/Tehran — see SETTLEMENT_CRON_TZ in settlementCycle.ts.
   */
  startDailySettlementCycle() {
    if (this.settlementCycleTimer || this.settlementCycleTimeout) return;
    const MS_DAY = 24 * 60 * 60 * 1000;
    const now = new Date();
    const next = new Date(now);
    next.setHours(2, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const delay = next.getTime() - now.getTime();
    this.settlementCycleTimeout = setTimeout(() => {
      this.settlementCycleTimeout = null;
      void this.enqueue("settlement", "daily-cycle-cron", { scheduled: true });
      this.settlementCycleTimer = setInterval(() => {
        void this.enqueue("settlement", "daily-cycle-cron", { scheduled: true });
      }, MS_DAY);
    }, delay);
  }

  stopDailySettlementCycle() {
    if (this.settlementCycleTimeout) {
      clearTimeout(this.settlementCycleTimeout);
      this.settlementCycleTimeout = null;
    }
    if (this.settlementCycleTimer) {
      clearInterval(this.settlementCycleTimer);
      this.settlementCycleTimer = null;
    }
  }

  resetForTests() {
    this.jobs.clear();
    this.pending = [];
    this.processing = false;
    this.stopNightlyReconciliation();
    this.stopNightlyKpi();
    this.stopDailySettlementCycle();
  }

  private publicJob(j: InternalJob): JobRecord {
    const { _resolve: _r, _reject: _j, ...rest } = j;
    return rest;
  }

  private async pump() {
    if (this.processing) return;
    this.processing = true;
    while (this.pending.length > 0) {
      const id = this.pending.shift()!;
      await this.runOne(id);
    }
    this.processing = false;
  }

  private async runOne(id: string) {
    const job = this.jobs.get(id);
    if (!job || job.status === "completed" || job.status === "failed") return;

    const handler = getJobHandler(job.queue, job.job_name);
    if (!handler) {
      await this.failJob(job, new Error(`no_handler:${job.queue}:${job.job_name}`));
      return;
    }

    job.attempts += 1;
    job.status = "active";
    job.started_at = new Date().toISOString();

    try {
      job.result = await handler(job.payload);
      job.status = "completed";
      job.completed_at = new Date().toISOString();
      job._resolve?.(this.publicJob(job));
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (job.attempts < job.max_attempts) {
        job.status = "queued";
        const wait = backoffMs(job.attempts);
        await new Promise((r) => setTimeout(r, wait));
        this.pending.push(id);
        return;
      }
      await this.failJob(job, error);
    }
  }

  private async failJob(job: InternalJob, error: Error) {
    job.status = "failed";
    job.error = error.message;
    job.completed_at = new Date().toISOString();
    await failedJobsRepo.insertFailedJob({
      queue_name: job.queue,
      job_name: job.job_name,
      payload: job.payload,
      error_message: error.message,
      stack_trace: error.stack,
      attempts: job.attempts,
      max_attempts: job.max_attempts,
      correlation_id: job.correlation_id,
    });
    if (job._resolve) {
      job._resolve(this.publicJob(job));
    } else {
      job._reject?.(error);
    }
  }

  async waitForJob(id: string, timeoutMs = 60_000): Promise<JobRecord> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const j = this.getJob(id);
      if (j && (j.status === "completed" || j.status === "failed")) return j;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`job_timeout:${id}`);
  }
}

export const jobQueue = new InMemoryJobQueue();

export function getQueueBackendLabel(): string {
  return process.env.REDIS_URL ? "bullmq+redis (planned)" : "in-memory";
}
