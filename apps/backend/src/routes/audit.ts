import { Router } from "express";
import { z } from "zod";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requirePermission } from "../middleware/rbac";
import { requireActiveCooperative, requireCooperativeScope } from "../middleware/scope";
import { resolveAuthContext } from "../lib/authContext";
import { buildCoopScopedAuditWhere } from "../lib/auditCoopScope";
import * as auditRepo from "../repositories/auditLogsRepository";
import { success } from "../http/apiResponse";
import { ApiError } from "../http/errors";
import { isCoopScopedRole, normalizeRole } from "../types/userRole";

const router = Router();
const requireAuth = authMiddleware(resolveAuthContext);

const querySchema = z.object({
  entity_type: z.string().min(1).optional(),
  entity_id: z.string().min(1).optional(),
  from: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
  to: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
  user_id: z.coerce.number().int().positive().optional(),
  limit: z.preprocess(
    (v) => (v === undefined || v === "" ? 50 : Number(v)),
    z.number().int().min(1).max(200),
  ),
  offset: z.preprocess(
    (v) => (v === undefined || v === "" ? 0 : Number(v)),
    z.number().int().min(0),
  ),
});

function parseDateParam(value: string, endOfDay: boolean): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T00:00:00.000Z`);
    if (endOfDay) d.setUTCHours(23, 59, 59, 999);
    return d;
  }
  return new Date(value);
}

router.get(
  "/audit",
  requireAuth,
  requirePermission("audit:read"),
  requireCooperativeScope(),
  requireActiveCooperative(),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    try {
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        return next(
          new ApiError({
            statusCode: 400,
            code: "invalid_request",
            message: "Invalid query parameters",
            requestId,
          }),
        );
      }

      const auth = (req as unknown as { auth: AuthContext }).auth;
      const normalized = normalizeRole(auth.user.role);
      let scopeWhere: Awaited<ReturnType<typeof buildCoopScopedAuditWhere>> | undefined;
      if (normalized !== "ADMIN" && isCoopScopedRole(auth.user.role)) {
        const coopId = auth.scope?.cooperativeId;
        if (!coopId) {
          return next(
            new ApiError({
              statusCode: 403,
              code: "forbidden",
              message: "No cooperative scope",
              requestId,
            }),
          );
        }
        scopeWhere = await buildCoopScopedAuditWhere(coopId);
      }

      const q = parsed.data;
      const from = q.from ? parseDateParam(q.from, false) : undefined;
      const to = q.to ? parseDateParam(q.to, true) : undefined;

      const { items, total } = await auditRepo.queryAuditLogs({
        entity_type: q.entity_type,
        entity_id: q.entity_id,
        from,
        to,
        user_id: q.user_id,
        limit: q.limit,
        offset: q.offset,
        scopeWhere,
      });

      return res.json(
        success(
          {
            logs: items.map((r) => ({
              id: r.id,
              entity_type: r.entity_type,
              entity_id: r.entity_id,
              action: r.action,
              before_value: r.before_value ?? null,
              after_value: r.after_value ?? null,
              performed_by_user_id: r.performed_by_user_id ?? null,
              reason: r.reason ?? null,
              created_at: r.at_created.toISOString(),
            })),
            total,
            limit: q.limit,
            offset: q.offset,
          },
          requestId,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

export const auditRouter = router;
