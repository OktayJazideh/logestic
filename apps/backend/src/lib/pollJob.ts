import { jobQueue } from "../queues/jobQueue";
import type { JobRecord } from "../queues/types";

export async function pollJobUntilDone(jobId: string, timeoutMs = 120_000): Promise<JobRecord> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = jobQueue.getJob(jobId);
    if (job?.status === "completed") return job;
    if (job?.status === "failed") throw new Error(job.error ?? "job_failed");
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error(`job_timeout:${jobId}`);
}
