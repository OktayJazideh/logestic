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

router.get("/hourly-work-logs", requireAuth, requireRoles(["CONSULTANT", "ADMIN"]), (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const auth = (req as any).auth as AuthContext;
  const mineId = auth.mineId ?? undefined;
  const logs = appContext.hourlyLogs.listForMine(mineId);
  return res.json(success({ logs }, requestId));
});

router.post("/hourly-work-logs", requireAuth, requireRoles(["CONSULTANT", "ADMIN"]), (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const auth = (req as any).auth as AuthContext;

  const body = z
    .object({
      mine_id: z.number().int().positive(),
      fleet_owner_id: z.number().int().positive(),
      household_id: z.number().int().positive(),
      vehicle_id: z.number().int().positive().optional(),
      hours: z.number().positive(),
      hourly_rate_per_hour: z.number().positive(),
    })
    .safeParse(req.body);
  if (!body.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
  }

  if (auth.mineId && body.data.mine_id !== auth.mineId) {
    return next(new ApiError({ statusCode: 403, code: "mine_mismatch", message: "Mine mismatch", requestId }));
  }

  const log = appContext.hourlyLogs.create(body.data);
  return res.json(success({ log }, requestId));
});

router.post("/hourly-work-logs/:logId/approve", requireAuth, requireRoles(["CONSULTANT"]), (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const auth = (req as any).auth as AuthContext;

  const logId = z.coerce.number().int().positive().safeParse(req.params.logId);
  if (!logId.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_log_id", message: "Invalid logId", requestId }));
  }

  const r = appContext.hourlyLogs.approve({ logId: logId.data, consultantUserId: auth.user.id });
  if (!r.ok) {
    return next(new ApiError({ statusCode: 409, code: "approve_failed", message: "Cannot approve log", details: r.reason, requestId }));
  }

  return res.json(success({ log: r.log, finance: r.finance }, requestId));
});

export const hourlyRouter = router;
