export const QUEUE_NAMES = ["settlement", "notification", "reconciliation", "event_log", "kpi"] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

export const SETTLEMENT_JOBS = ["monthly-close", "distribute-pool", "export-excel", "execute-payouts", "daily-cycle-cron"] as const;
export const NOTIFICATION_JOBS = ["push", "sms", "in-app"] as const;
export const RECONCILIATION_JOBS = ["nightly-run"] as const;
export const EVENT_LOG_JOBS = ["persist-event"] as const;
export const KPI_JOBS = ["daily-snapshot"] as const;

export type JobStatus = "queued" | "active" | "completed" | "failed";

export type JobRecord = {
  id: string;
  queue: QueueName;
  job_name: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  correlation_id?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
  result?: unknown;
};

export type EnqueueOptions = {
  correlation_id?: string;
  /** Wait until job finishes (HTTP handlers). */
  wait?: boolean;
};

export type JobHandler = (payload: Record<string, unknown>) => Promise<unknown>;

export const MAX_JOB_ATTEMPTS = 4;
export const MAX_RETRIES = 3;

export function backoffMs(attempt: number): number {
  return Math.min(2 ** Math.max(0, attempt - 1) * 1000, 30_000);
}
