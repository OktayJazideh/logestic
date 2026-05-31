import { prisma } from "../db/prisma";
import type { Prisma } from "@prisma/client";
import type { QueueName } from "../queues/types";

export type FailedJobRow = {
  id: number;
  queue_name: string;
  job_name: string;
  payload: Record<string, unknown>;
  error_message: string;
  stack_trace: string | null;
  attempts: number;
  max_attempts: number;
  correlation_id: string | null;
  failed_at: Date;
  retried_at: Date | null;
  status: string;
};

function mapRow(r: {
  id: bigint;
  queue_name: string;
  job_name: string;
  payload: unknown;
  error_message: string;
  stack_trace: string | null;
  attempts: number;
  max_attempts: number;
  correlation_id: string | null;
  failed_at: Date;
  retried_at: Date | null;
  status: string;
}): FailedJobRow {
  return {
    id: Number(r.id),
    queue_name: r.queue_name,
    job_name: r.job_name,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    error_message: r.error_message,
    stack_trace: r.stack_trace,
    attempts: r.attempts,
    max_attempts: r.max_attempts,
    correlation_id: r.correlation_id,
    failed_at: r.failed_at,
    retried_at: r.retried_at,
    status: r.status,
  };
}

export async function insertFailedJob(params: {
  queue_name: QueueName;
  job_name: string;
  payload: Record<string, unknown>;
  error_message: string;
  stack_trace?: string;
  attempts: number;
  max_attempts: number;
  correlation_id?: string;
}): Promise<FailedJobRow> {
  const row = await prisma.failed_jobs.create({
    data: {
      queue_name: params.queue_name,
      job_name: params.job_name,
      payload: params.payload as Prisma.InputJsonValue,
      error_message: params.error_message,
      stack_trace: params.stack_trace ?? null,
      attempts: params.attempts,
      max_attempts: params.max_attempts,
      correlation_id: params.correlation_id ?? null,
      status: "failed",
    },
  });
  return mapRow(row);
}

export async function listFailedJobs(params?: { queue?: QueueName; limit?: number }): Promise<FailedJobRow[]> {
  const rows = await prisma.failed_jobs.findMany({
    where: {
      status: "failed",
      ...(params?.queue ? { queue_name: params.queue } : {}),
    },
    orderBy: { failed_at: "desc" },
    take: params?.limit ?? 100,
  });
  return rows.map(mapRow);
}

export async function getFailedJob(id: number): Promise<FailedJobRow | null> {
  const row = await prisma.failed_jobs.findUnique({ where: { id: BigInt(id) } });
  return row ? mapRow(row) : null;
}

export async function markFailedJobRetried(id: number): Promise<void> {
  await prisma.failed_jobs.update({
    where: { id: BigInt(id) },
    data: { status: "retried", retried_at: new Date() },
  });
}

export async function deleteAllFailedJobsForTests(): Promise<void> {
  await prisma.failed_jobs.deleteMany();
}
