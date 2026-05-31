import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/authMiddleware";
import { requireRoles } from "../middleware/rbac";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import { jobQueue, getQueueBackendLabel } from "../queues/jobQueue";
import * as failedJobsRepo from "../repositories/failedJobsRepository";
import { QUEUE_NAMES } from "../queues/types";

const router = Router();
const requireAuth = authMiddleware(resolveAuthContext);
const adminJobs = [requireAuth, requireRoles(["ADMIN", "OPERATION_ADMIN"])] as const;

router.get("/admin/jobs", ...adminJobs, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const status = typeof req.query.status === "string" ? req.query.status : "all";
    const active = jobQueue.listActive();
    const completed = jobQueue.listRecentCompleted(30);
    const failed = await failedJobsRepo.listFailedJobs({ limit: 100 });
    return res.json(
      success(
        {
          backend: getQueueBackendLabel(),
          queues: QUEUE_NAMES,
          active: status === "failed" ? [] : active,
          completed: status === "failed" || status === "active" ? [] : completed,
          failed: status === "active" ? [] : failed,
        },
        requestId,
      ),
    );
  } catch (e) {
    next(e);
  }
});

router.get("/admin/jobs/failed", ...adminJobs, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const queue =
      typeof req.query.queue === "string" && QUEUE_NAMES.includes(req.query.queue as (typeof QUEUE_NAMES)[number])
        ? (req.query.queue as (typeof QUEUE_NAMES)[number])
        : undefined;
    const failed = await failedJobsRepo.listFailedJobs({ queue, limit: 200 });
    return res.json(success({ failed }, requestId));
  } catch (e) {
    next(e);
  }
});

router.get("/admin/jobs/:jobId", ...adminJobs, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const jobId = z.string().uuid().safeParse(req.params.jobId);
    if (!jobId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_job_id", message: "Invalid job id", requestId }));
    }
    const job = jobQueue.getJob(jobId.data);
    if (!job) {
      return next(new ApiError({ statusCode: 404, code: "job_not_found", message: "Job not found", requestId }));
    }
    return res.json(success({ job }, requestId));
  } catch (e) {
    next(e);
  }
});

router.get("/admin/jobs/:jobId/download", ...adminJobs, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const jobId = z.string().uuid().safeParse(req.params.jobId);
    if (!jobId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_job_id", message: "Invalid job id", requestId }));
    }
    const job = jobQueue.getJob(jobId.data);
    if (!job) {
      return next(new ApiError({ statusCode: 404, code: "job_not_found", message: "Job not found", requestId }));
    }
    if (job.status !== "completed") {
      return next(
        new ApiError({
          statusCode: 409,
          code: "job_not_ready",
          message: `Job status is ${job.status}`,
          requestId,
        }),
      );
    }
    const result = job.result as { csv?: string; filename?: string; content_type?: string } | undefined;
    if (!result?.csv) {
      return next(new ApiError({ statusCode: 404, code: "no_artifact", message: "No download artifact on job", requestId }));
    }
    res.setHeader("Content-Type", result.content_type ?? "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename ?? "export.csv"}"`);
    return res.send(result.csv);
  } catch (e) {
    next(e);
  }
});

router.post("/admin/jobs/failed/:id/retry", ...adminJobs, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_id", message: "Invalid failed job id", requestId }));
    }
    const job = await jobQueue.retryFailedJob(id.data);
    return res.status(202).json(success({ job, status: job.status }, requestId));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "failed_job_not_found" || msg === "job_not_retryable") {
      return next(new ApiError({ statusCode: 404, code: msg, message: msg, requestId }));
    }
    next(e);
  }
});

router.post("/admin/jobs/reconciliation/run", ...adminJobs, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const job = await jobQueue.enqueue("reconciliation", "nightly-run", { manual: true }, {
      correlation_id: requestId,
    });
    return res.status(202).json(success({ job, status: job.status }, requestId));
  } catch (e) {
    next(e);
  }
});

export const jobsRouter = router;
