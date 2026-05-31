import { Router } from "express";
import { z } from "zod";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requireAnyPermission, requireRoles } from "../middleware/rbac";
import { requireMineContext } from "../middleware/requireMineContext";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import { resolveEffectiveMineId } from "../lib/mineScope";
import { computeDailyKpis, getKpiDashboard, getOpsDashboard } from "../services/kpiService";
import { jobQueue } from "../queues/jobQueue";

const router = Router();
const requireAuth = authMiddleware(resolveAuthContext);
const requireAdmin = [requireAuth, requireRoles(["ADMIN", "OPERATION_ADMIN"])] as const;
const requireOpsDashboard = [
  requireAuth,
  requireMineContext(),
  requireAnyPermission("ops:*", "users:manage"),
] as const;

const rangeQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mine_id: z.coerce.number().int().positive().optional(),
});

router.get("/admin/ops-dashboard", ...requireOpsDashboard, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as typeof req & { auth: AuthContext }).auth;
  try {
    const mine_id = resolveEffectiveMineId(auth, undefined, requestId);
    const dashboard = await getOpsDashboard(mine_id);
    return res.json(success({ dashboard }, requestId));
  } catch (e) {
    next(e);
  }
});

router.get("/admin/kpi/dashboard", ...requireAdmin, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const parsed = rangeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError({
        statusCode: 400,
        code: "invalid_request",
        message: "from and to (YYYY-MM-DD) required",
        requestId,
      });
    }
    const dashboard = await getKpiDashboard(parsed.data);
    return res.json(success({ dashboard }, requestId));
  } catch (e) {
    next(e);
  }
});

router.post("/admin/kpi/compute", ...requireAdmin, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const body = z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      mine_id: z.number().int().positive().optional(),
      async: z.boolean().optional(),
    })
    .safeParse(req.body ?? {});

  if (!body.success) {
    throw new ApiError({
      statusCode: 400,
      code: "invalid_request",
      message: "invalid body",
      requestId,
    });
  }

  try {
    const dateStr = body.data.date ?? new Date().toISOString().slice(0, 10);
    const payload = { date: dateStr, mine_id: body.data.mine_id };

    if (body.data.async) {
      const job = await jobQueue.enqueue("kpi", "daily-snapshot", payload, {
        correlation_id: requestId,
      });
      return res.status(202).json(
        success(
          {
            job_id: job.id,
            status: job.status,
            poll_url: `/api/admin/jobs/${job.id}`,
          },
          requestId,
        ),
      );
    }

    const result = await computeDailyKpis(new Date(`${dateStr}T00:00:00.000Z`), body.data.mine_id);
    return res.json(success({ result }, requestId));
  } catch (e) {
    next(e);
  }
});

export const adminKpiRouter = router;
