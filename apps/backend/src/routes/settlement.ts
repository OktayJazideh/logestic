import { Router } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requireRoles } from "../middleware/rbac";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";

const router = Router();

const getAuthContext = (token: string): AuthContext | null => {
  const u = appContext.authService.getUserFromSession(token);
  if (!u) return null;
  const session = appContext.sessionStore.getSession(token);
  return { token, user: u, mineId: session?.mineId };
};

const requireAuth = authMiddleware(getAuthContext);

router.get("/settlement/batches", requireAuth, requireRoles(["ADMIN"]), (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const batches = appContext.settlement.listBatches();
  return res.json(success({ batches }, requestId));
});

router.post("/settlement/batches", requireAuth, requireRoles(["ADMIN"]), (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const auth = (req as any).auth as AuthContext;

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

  const r = appContext.settlement.createDraft({
    mine_id: body.data.mine_id,
    period_start: new Date(body.data.period_start),
    period_end: new Date(body.data.period_end),
    created_by_user_id: auth.user.id,
    lines: body.data.lines,
  });

  return res.json(success(r, requestId));
});

router.post("/settlement/batches/:batchId/lock", requireAuth, requireRoles(["ADMIN"]), (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const batchId = z.coerce.number().int().positive().safeParse(req.params.batchId);
  if (!batchId.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_batch_id", message: "Invalid batchId", requestId }));
  }
  const r = appContext.settlement.lock(batchId.data);
  if (!r.ok) {
    return next(new ApiError({ statusCode: 409, code: "lock_failed", message: "Cannot lock batch", details: r.reason, requestId }));
  }
  return res.json(success({ batch: r.batch }, requestId));
});

router.post("/settlement/batches/:batchId/pay", requireAuth, requireRoles(["ADMIN"]), (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const batchId = z.coerce.number().int().positive().safeParse(req.params.batchId);
  if (!batchId.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_batch_id", message: "Invalid batchId", requestId }));
  }
  const r = appContext.settlement.markPaid(batchId.data);
  if (!r.ok) {
    return next(new ApiError({ statusCode: 409, code: "pay_failed", message: "Cannot mark paid", details: r.reason, requestId }));
  }
  return res.json(success({ batch: r.batch }, requestId));
});

export const settlementRouter = router;
