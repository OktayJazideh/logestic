import { Router } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requirePermission, requireRoles } from "../middleware/rbac";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import { requireMineContext, requireOperationalWorkspace } from "../middleware/requireMineContext";

const router = Router();

const requireAuth = authMiddleware(resolveAuthContext);
const requireOp = [requireAuth, requireMineContext(), requireOperationalWorkspace()] as const;

const geoSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

router.get("/operator/hourly/context", ...requireOp, requireRoles(["OPERATOR"]), async (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const auth = (req as any).auth as AuthContext;
  const mineId = auth.mineId;
  if (!mineId) {
    return next(
      new ApiError({ statusCode: 400, code: "mine_not_selected", message: "Select workspace first", requestId }),
    );
  }
  const ctx = await appContext.hourlyLogs.getOperatorContext(mineId);
  return res.json(success(ctx, requestId));
});

router.get("/hourly", ...requireOp, requireRoles(["CONSULTANT", "ADMIN"]), async (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const auth = (req as any).auth as AuthContext;
  const mineId = auth.mineId ?? undefined;
  const statusQuery = z
    .enum(["STARTED", "ENDED", "APPROVED", "REJECTED", "PENDING"])
    .optional()
    .safeParse(req.query.status);
  if (!statusQuery.success) {
    return next(
      new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid status filter", requestId }),
    );
  }
  const logs =
    statusQuery.data === "ENDED"
      ? await appContext.hourlyLogs.listConsultantInbox(mineId)
      : await appContext.hourlyLogs.listForMine(mineId, statusQuery.data);
  return res.json(success({ logs }, requestId));
});

router.get("/hourly-work-logs", ...requireOp, requireRoles(["CONSULTANT", "ADMIN"]), async (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const auth = (req as any).auth as AuthContext;
  const mineId = auth.mineId ?? undefined;
  const logs = await appContext.hourlyLogs.listForMine(mineId);
  return res.json(success({ logs }, requestId));
});

router.post("/hourly/start", ...requireOp, requireRoles(["OPERATOR"]), async (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;

  const body = z
    .object({
      mission_id: z.number().int().positive(),
      vehicle_id: z.number().int().positive(),
      household_id: z.number().int().positive(),
      start_photo_url: z.string().url(),
      start_geo: geoSchema,
      note: z.string().min(1).optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
  }

  const r = await appContext.hourlyLogs.start(body.data);
  if (!r.ok) {
    const status = r.reason === "mission_not_found" ? 404 : 409;
    return next(
      new ApiError({
        statusCode: status,
        code: r.reason,
        message: "Cannot start hourly log",
        details: r.reason,
        requestId,
      }),
    );
  }

  return res.status(201).json(success({ log: r.log }, requestId));
});

router.post("/hourly/:id/end", ...requireOp, requireRoles(["OPERATOR"]), async (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;

  const logId = z.coerce.number().int().positive().safeParse(req.params.id);
  const body = z
    .object({
      end_photo_url: z.string().url(),
      end_geo: geoSchema,
      note: z.string().min(1).optional(),
    })
    .safeParse(req.body);
  if (!logId.success || !body.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid request", requestId }));
  }

  const r = await appContext.hourlyLogs.end(logId.data, body.data);
  if (!r.ok) {
    return next(
      new ApiError({
        statusCode: 409,
        code: r.reason,
        message: "Cannot end hourly log",
        details: r.reason,
        requestId,
      }),
    );
  }

  return res.json(success({ log: r.log }, requestId));
});

router.post("/hourly/:id/verify", ...requireOp, requirePermission("hourly:verify"), async (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const auth = (req as any).auth as AuthContext;

  const logId = z.coerce.number().int().positive().safeParse(req.params.id);
  const body = z
    .object({
      billable_hours: z.number().positive(),
      reason: z.string().min(3),
    })
    .safeParse(req.body);
  if (!logId.success || !body.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid request", requestId }));
  }

  const r = await appContext.hourlyLogs.verify({
    logId: logId.data,
    consultantUserId: auth.user.id,
    billable_hours: body.data.billable_hours,
    reason: body.data.reason,
  });

  if (!r.ok) {
    const status = r.reason === "no_valid_rate_card" || r.reason === "billable_exceeds_raw" ? 409 : 409;
    return next(
      new ApiError({
        statusCode: status,
        code: r.reason,
        message: "Cannot verify hourly log",
        details: r.reason,
        requestId,
      }),
    );
  }

  return res.json(success({ log: r.log, finance: r.finance }, requestId));
});

router.post("/hourly/:id/reject", ...requireOp, requirePermission("hourly:reject"), async (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const auth = (req as any).auth as AuthContext;

  const logId = z.coerce.number().int().positive().safeParse(req.params.id);
  const body = z
    .object({
      rejection_reason: z.string().min(10),
    })
    .safeParse(req.body);
  if (!logId.success || !body.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid request", requestId }));
  }

  const r = await appContext.hourlyLogs.reject({
    logId: logId.data,
    consultantUserId: auth.user.id,
    rejection_reason: body.data.rejection_reason,
  });

  if (!r.ok) {
    const status =
      r.reason === "invalid_log"
        ? 404
        : r.reason === "already_finalized" || r.reason === "invalid_log_state"
          ? 409
          : 409;
    return next(
      new ApiError({
        statusCode: status,
        code: r.reason,
        message: "Cannot reject hourly log",
        details: r.reason,
        requestId,
      }),
    );
  }

  return res.json(success({ log: r.log }, requestId));
});

export const hourlyRouter = router;
