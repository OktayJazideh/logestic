import { Router } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requirePermission, requireRoles } from "../middleware/rbac";
import { requireMineContext, requireSessionMineWorkspace } from "../middleware/requireMineContext";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import { assertBatchMineScope, resolveEffectiveMineId } from "../lib/mineScope";
import { jobQueue } from "../queues/jobQueue";
import { idempotencyMiddleware } from "../middleware/idempotency";
import { enqueueBankPayoutsAfterLock, exportOwnerRowsToCsv, exportHouseholdRowsToCsv } from "../services/settlementService";
import {
  assertReceiptLineAccess,
  generateSettlementLineReceiptPdf,
} from "../services/receiptPdfService";
import * as settlementRepo from "../repositories/settlementRepository";

const router = Router();
const idem = idempotencyMiddleware();

const requireAuth = authMiddleware(resolveAuthContext);
const requireSettlementMine = [requireMineContext(), requireSessionMineWorkspace()] as const;

const paymentReferenceSchema = z.string().min(8, "payment_reference must be at least 8 characters");

const adminSettlementExecute = [
  requireAuth,
  ...requireSettlementMine,
  requireRoles(["OPERATION_ADMIN"]),
  requirePermission("settlement:execute"),
] as const;

const adminSettlementApprove = [
  requireAuth,
  ...requireSettlementMine,
  requireRoles(["COOP_ADMIN", "OPERATION_ADMIN"]),
  requirePermission("settlement:approve"),
] as const;

const adminSettlementLock = [
  requireAuth,
  ...requireSettlementMine,
  requireRoles(["OPERATION_ADMIN"]),
  requirePermission("settlement:lock"),
] as const;

async function loadBatchInMineScope(
  auth: AuthContext,
  batchId: number,
  requestId?: string,
): Promise<NonNullable<Awaited<ReturnType<typeof appContext.settlement.getBatch>>>> {
  const batch = await appContext.settlement.getBatch(batchId);
  if (!batch) {
    throw new ApiError({ statusCode: 404, code: "batch_not_found", message: "Batch not found", requestId });
  }
  assertBatchMineScope(auth, batch, requestId);
  return batch;
}

router.get("/settlement/batches", ...adminSettlementExecute, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as unknown as { auth: AuthContext }).auth;
  try {
    const queryMine = z.coerce.number().int().positive().optional().safeParse(req.query.mine_id);
    if (!queryMine.success && req.query.mine_id != null && req.query.mine_id !== "") {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid mine_id", requestId }));
    }
    const mineId = resolveEffectiveMineId(auth, queryMine.data, requestId);
    const batches = await appContext.settlement.listBatches({ mine_id: mineId });
    return res.json(success({ batches, mine_id: mineId }, requestId));
  } catch (e) {
    next(e);
  }
});

router.post("/settlement/batches", ...adminSettlementExecute, idem, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as unknown as { auth: AuthContext }).auth;

  try {
    const body = z
      .object({
        mine_id: z.number().int().positive().optional(),
        period_start: z.string(),
        period_end: z.string(),
        lines: z.array(
          z.object({
            wallet_id: z.number().int().positive(),
            amount: z.number(),
            mission_id: z.number().int().positive().optional(),
            note: z.string().optional(),
          }),
        ),
      })
      .safeParse(req.body);
    if (!body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
    }

    const mineId = resolveEffectiveMineId(auth, body.data.mine_id, requestId);

    const r = await appContext.settlement.createDraft({
      mine_id: mineId,
      period_start: new Date(body.data.period_start),
      period_end: new Date(body.data.period_end),
      created_by_user_id: auth.user.id,
      lines: body.data.lines,
    });

    return res.json(success(r, requestId));
  } catch (e) {
    next(e);
  }
});

/** Legacy lock — CALCULATED/DRAFT → READY_FOR_SETTLEMENT (GOV-WORKFLOW-1 dual approve + maker/checker) */
router.post("/settlement/batches/:batchId/lock", ...adminSettlementLock, idem, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as unknown as { auth: AuthContext }).auth;
  try {
    const batchId = z.coerce.number().int().positive().safeParse(req.params.batchId);
    if (!batchId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_batch_id", message: "Invalid batchId", requestId }));
    }
    await loadBatchInMineScope(auth, batchId.data, requestId);
    const r = await appContext.settlement.lock(batchId.data, auth.user.id);
    if (!r.ok) {
      const status =
        r.reason === "dual_approval_required" || r.reason === "maker_checker_same_user" ? 409 : 409;
      return next(new ApiError({ statusCode: status, code: r.reason, message: "Cannot lock batch", details: r.reason, requestId }));
    }
    const payoutJob = await enqueueBankPayoutsAfterLock(batchId.data, requestId);
    return res.json(success({ batch: r.batch, payout_job: payoutJob }, requestId));
  } catch (e) {
    next(e);
  }
});

/** Legacy pay — requires IN_BANK_QUEUE + payment_reference */
router.post("/settlement/batches/:batchId/pay", ...adminSettlementExecute, idem, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as unknown as { auth: AuthContext }).auth;
  try {
    const batchId = z.coerce.number().int().positive().safeParse(req.params.batchId);
    if (!batchId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_batch_id", message: "Invalid batchId", requestId }));
    }
    await loadBatchInMineScope(auth, batchId.data, requestId);
    const body = z
      .object({
        payment_reference: paymentReferenceSchema,
        receipt_file_url: z.string().url().optional(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
    }
    const r = await appContext.settlement.markPaid(
      batchId.data,
      body.data.payment_reference,
      body.data.receipt_file_url ?? `legacy://${batchId.data}`,
    );
    if (!r.ok) {
      return next(new ApiError({ statusCode: 409, code: "pay_failed", message: "Cannot mark paid", details: r.reason, requestId }));
    }
    return res.json(success({ batch: r.batch, payouts: r.payouts }, requestId));
  } catch (e) {
    next(e);
  }
});

router.get("/settlement/community-pools", requireAuth, requireRoles(["ADMIN", "CONSULTANT"]), async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const pools = await appContext.finance.listCommunityPools();
    return res.json(success({ pools }, requestId));
  } catch (e) {
    next(e);
  }
});

router.post("/settlement/community-pools/lock", ...adminSettlementExecute, idem, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as unknown as { auth: AuthContext }).auth;
  try {
    const body = z
      .object({
        period_key: z.string().min(7),
        mine_id: z.number().int().positive().optional(),
        household_ids: z.array(z.number().int().positive()).min(1),
      })
      .safeParse(req.body);
    if (!body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
    }
    const mineId = resolveEffectiveMineId(auth, body.data.mine_id, requestId);
    const r = await appContext.finance.lockCommunityPoolSnapshot({ ...body.data, mine_id: mineId });
    if (!r.ok) {
      return next(new ApiError({ statusCode: 409, code: "lock_pool_failed", message: "Cannot lock pool", details: r.reason, requestId }));
    }
    return res.json(success({ pool: r.pool }, requestId));
  } catch (e) {
    next(e);
  }
});

/** SET-1 + QUEUE-1: monthly-close (async — 202 + poll GET /admin/jobs/:jobId) */
router.post("/admin/settlement/monthly-close", ...adminSettlementExecute, idem, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as unknown as { auth: AuthContext }).auth;
  try {
    const body = z
      .object({
        mine_id: z.number().int().positive().default(1),
        year: z.number().int().min(2020).max(2100),
        month: z.number().int().min(1).max(12),
        /** Tests / legacy: block until job completes. */
        wait: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
    }
    const { wait: waitSync, mine_id: requestedMineId, ...restClose } = body.data;
    const mineId = resolveEffectiveMineId(auth, requestedMineId, requestId);
    const closeParams = { ...restClose, mine_id: mineId };
    const queued = await jobQueue.enqueue(
      "settlement",
      "monthly-close",
      { ...closeParams, created_by_user_id: auth.user.id },
      { wait: waitSync === true, correlation_id: requestId },
    );
    if (waitSync) {
      if (queued.status === "failed") {
        return next(
          new ApiError({
            statusCode: 409,
            code: "monthly_close_failed",
            message: queued.error ?? "Cannot close monthly settlement",
            requestId,
          }),
        );
      }
      const r = queued.result as Awaited<ReturnType<typeof appContext.settlement.monthlyClose>>;
      if (!r || typeof r !== "object" || !("ok" in r) || !r.ok) {
        return next(
          new ApiError({
            statusCode: 409,
            code: "monthly_close_failed",
            message: "Cannot close monthly settlement",
            details: r && typeof r === "object" && "reason" in r ? r.reason : undefined,
            requestId,
          }),
        );
      }
      return res.json(
        success(
          {
            job_id: queued.id,
            batch: r.batch,
            lines: r.lines,
            pool_distribution: r.pool_distribution,
          },
          requestId,
        ),
      );
    }
    return res.status(202).json(
      success(
        {
          job_id: queued.id,
          status: queued.status,
          poll_url: `/api/admin/jobs/${queued.id}`,
        },
        requestId,
      ),
    );
  } catch (e) {
    next(e);
  }
});

/** QUEUE-1: distribute community pool (async) */
router.post("/admin/settlement/community-pools/:poolId/distribute", ...adminSettlementExecute, idem, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const poolId = z.coerce.number().int().positive().safeParse(req.params.poolId);
    if (!poolId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_pool_id", message: "Invalid poolId", requestId }));
    }
    const body = z.object({ at: z.string().optional() }).safeParse(req.body ?? {});
    if (!body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
    }
    const job = await jobQueue.enqueue(
      "settlement",
      "distribute-pool",
      { pool_id: poolId.data, at: body.data.at },
      { correlation_id: requestId },
    );
    return res.status(202).json(
      success({ job_id: job.id, status: job.status, poll_url: `/api/admin/jobs/${job.id}` }, requestId),
    );
  } catch (e) {
    next(e);
  }
});

router.post("/admin/settlement/:batchId/approve", ...adminSettlementApprove, idem, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as unknown as { auth: AuthContext }).auth;
  try {
    const batchId = z.coerce.number().int().positive().safeParse(req.params.batchId);
    if (!batchId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_batch_id", message: "Invalid batchId", requestId }));
    }
    await loadBatchInMineScope(auth, batchId.data, requestId);
    const r = await appContext.settlement.approveBatch({
      batchId: batchId.data,
      userId: auth.user.id,
      userRole: auth.user.role,
    });
    if (!r.ok) {
      const status = r.reason === "role_cannot_approve" ? 403 : 409;
      return next(new ApiError({ statusCode: status, code: r.reason, message: "Cannot approve batch", details: r.reason, requestId }));
    }
    return res.json(success({ batch: r.batch }, requestId));
  } catch (e) {
    next(e);
  }
});

router.post("/admin/settlement/:batchId/lock", ...adminSettlementLock, idem, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as unknown as { auth: AuthContext }).auth;
  try {
    const batchId = z.coerce.number().int().positive().safeParse(req.params.batchId);
    if (!batchId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_batch_id", message: "Invalid batchId", requestId }));
    }
    await loadBatchInMineScope(auth, batchId.data, requestId);
    const r = await appContext.settlement.lock(batchId.data, auth.user.id);
    if (!r.ok) {
      return next(new ApiError({ statusCode: 409, code: r.reason, message: "Cannot lock batch", details: r.reason, requestId }));
    }
    const payoutJob = await enqueueBankPayoutsAfterLock(batchId.data, requestId);
    return res.json(success({ batch: r.batch, payout_job: payoutJob }, requestId));
  } catch (e) {
    next(e);
  }
});

router.post("/admin/settlement/:batchId/send-to-bank", ...adminSettlementExecute, idem, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as unknown as { auth: AuthContext }).auth;
  try {
    const batchId = z.coerce.number().int().positive().safeParse(req.params.batchId);
    if (!batchId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_batch_id", message: "Invalid batchId", requestId }));
    }
    await loadBatchInMineScope(auth, batchId.data, requestId);
    const r = await appContext.settlement.sendToBank(batchId.data);
    if (!r.ok) {
      return next(new ApiError({ statusCode: 409, code: "send_to_bank_failed", message: "Cannot send to bank", details: r.reason, requestId }));
    }
    return res.json(success({ batch: r.batch }, requestId));
  } catch (e) {
    next(e);
  }
});

router.post("/admin/settlement/:batchId/mark-paid", ...adminSettlementExecute, idem, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as unknown as { auth: AuthContext }).auth;
  try {
    const batchId = z.coerce.number().int().positive().safeParse(req.params.batchId);
    if (!batchId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_batch_id", message: "Invalid batchId", requestId }));
    }
    await loadBatchInMineScope(auth, batchId.data, requestId);
    const body = z
      .object({
        payment_reference: paymentReferenceSchema,
        receipt_file_url: z.string().url(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
    }
    const r = await appContext.settlement.markPaid(
      batchId.data,
      body.data.payment_reference,
      body.data.receipt_file_url,
    );
    if (!r.ok) {
      return next(new ApiError({ statusCode: 409, code: "mark_paid_failed", message: "Cannot mark paid", details: r.reason, requestId }));
    }
    return res.json(success({ batch: r.batch, payouts: r.payouts }, requestId));
  } catch (e) {
    next(e);
  }
});

router.post("/admin/settlement/:batchId/mark-failed", ...adminSettlementExecute, idem, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as unknown as { auth: AuthContext }).auth;
  try {
    const batchId = z.coerce.number().int().positive().safeParse(req.params.batchId);
    if (!batchId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_batch_id", message: "Invalid batchId", requestId }));
    }
    await loadBatchInMineScope(auth, batchId.data, requestId);
    const body = z.object({ reason: z.string().min(3) }).safeParse(req.body ?? {});
    if (!body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
    }
    const r = await appContext.settlement.markFailed(batchId.data, body.data.reason, auth.user.id);
    if (!r.ok) {
      return next(new ApiError({ statusCode: 409, code: "mark_failed", message: "Cannot mark failed", details: r.reason, requestId }));
    }
    return res.json(success({ batch: r.batch }, requestId));
  } catch (e) {
    next(e);
  }
});

/** QUEUE-1: export Excel (async — default POST; GET ?sync=1 for immediate download) */
router.post("/admin/settlement/:batchId/export", ...adminSettlementExecute, idem, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as unknown as { auth: AuthContext }).auth;
  try {
    const batchId = z.coerce.number().int().positive().safeParse(req.params.batchId);
    if (!batchId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_batch_id", message: "Invalid batchId", requestId }));
    }
    await loadBatchInMineScope(auth, batchId.data, requestId);
    const job = await jobQueue.enqueue(
      "settlement",
      "export-excel",
      { batch_id: batchId.data },
      { correlation_id: requestId },
    );
    return res.status(202).json(
      success(
        {
          job_id: job.id,
          status: job.status,
          poll_url: `/api/admin/jobs/${job.id}`,
          download_url: `/api/admin/jobs/${job.id}/download`,
        },
        requestId,
      ),
    );
  } catch (e) {
    next(e);
  }
});

router.get("/admin/settlement/:batchId/export", ...adminSettlementExecute, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as unknown as { auth: AuthContext }).auth;
  try {
    const batchId = z.coerce.number().int().positive().safeParse(req.params.batchId);
    if (!batchId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_batch_id", message: "Invalid batchId", requestId }));
    }
    const sync = req.query.sync === "1" || req.query.sync === "true";
    if (!sync) {
      await loadBatchInMineScope(auth, batchId.data, requestId);
      const job = await jobQueue.enqueue(
        "settlement",
        "export-excel",
        { batch_id: batchId.data },
        { correlation_id: requestId },
      );
      return res.status(202).json(
        success(
          {
            job_id: job.id,
            status: job.status,
            poll_url: `/api/admin/jobs/${job.id}`,
            download_url: `/api/admin/jobs/${job.id}/download`,
          },
          requestId,
        ),
      );
    }
    const format = z.enum(["excel", "csv"]).catch("excel").parse(req.query.format ?? "excel");
    await loadBatchInMineScope(auth, batchId.data, requestId);
    const rows = await appContext.settlement.buildExportRows(batchId.data);
    const csv = appContext.settlement.exportRowsToCsv(rows, "internal");
    const filename = `settlement-batch-${batchId.data}.csv`;
    res.setHeader("Content-Type", format === "excel" ? "application/vnd.ms-excel; charset=utf-8" : "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (e) {
    next(e);
  }
});

/** SET-CYCLE-1: owner-only CSV export (separate filename from household). */
router.get("/settlement/batches/:batchId/export-owner.csv", ...adminSettlementExecute, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as unknown as { auth: AuthContext }).auth;
  try {
    const batchId = z.coerce.number().int().positive().safeParse(req.params.batchId);
    if (!batchId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_batch_id", message: "Invalid batchId", requestId }));
    }
    await loadBatchInMineScope(auth, batchId.data, requestId);
    const rows = await appContext.settlement.buildOwnerExportRows(batchId.data);
    const csv = exportOwnerRowsToCsv(rows);
    const filename = `settlement-batch-${batchId.data}-owner.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (e) {
    next(e);
  }
});

/** SET-CYCLE-1: household/pool-only CSV export. */
router.get("/settlement/batches/:batchId/export-household.csv", ...adminSettlementExecute, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as unknown as { auth: AuthContext }).auth;
  try {
    const batchId = z.coerce.number().int().positive().safeParse(req.params.batchId);
    if (!batchId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_batch_id", message: "Invalid batchId", requestId }));
    }
    await loadBatchInMineScope(auth, batchId.data, requestId);
    const rows = await appContext.settlement.buildHouseholdExportRows(batchId.data);
    const csv = exportHouseholdRowsToCsv(rows);
    const filename = `settlement-batch-${batchId.data}-household.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (e) {
    next(e);
  }
});

/** RECEIPT-PDF-1: settlement line receipt PDF (wallet owner or ADMIN). */
router.get("/settlement/lines/:lineId/receipt.pdf", requireAuth, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as unknown as { auth: AuthContext }).auth;
  try {
    const lineId = z.coerce.number().int().positive().safeParse(req.params.lineId);
    if (!lineId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_line_id", message: "Invalid lineId", requestId }));
    }
    const line = await settlementRepo.getLineForReceipt(lineId.data);
    if (!line) {
      return next(new ApiError({ statusCode: 404, code: "line_not_found", message: "Settlement line not found", requestId }));
    }
    assertReceiptLineAccess(auth, line, requestId);
    const { buffer } = await generateSettlementLineReceiptPdf(lineId.data);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="receipt-line-${lineId.data}.pdf"`);
    return res.send(buffer);
  } catch (e) {
    next(e);
  }
});

export const settlementRouter = router;
