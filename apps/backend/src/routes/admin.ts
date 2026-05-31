import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requirePermission, requireRoles } from "../middleware/rbac";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import { idempotencyMiddleware } from "../middleware/idempotency";
import { isCoopScopedRole, normalizeRole, type UserRole } from "../types/userRole";
import { adminCooperativesRouter } from "./adminCooperatives";
import { adminFinanceRouter } from "./adminFinance";
import { adminKpiRouter } from "./adminKpi";
import { adminApprovalsRouter } from "./adminApprovals";
import { ruleEngine, SEED_RULE_KEYS } from "../services/ruleEngine";
import type { FinanceRuleScope } from "../repositories/financeRulesRepository";
import { reconciliationService } from "../services/reconciliationService";
import { restoreEntity, softDeleteEntity } from "../services/softDeleteService";
import { requireMineContext } from "../middleware/requireMineContext";
import { resolveEffectiveMineId } from "../lib/mineScope";
import { isDispatchQueueEnabled } from "../config/env";
import { getDispatchBoard } from "../services/dispatchBoardService";
import * as needsRepo from "../repositories/operationNeedsRepository";

const router = Router();
router.use(adminCooperativesRouter);
router.use(adminFinanceRouter);
router.use(adminKpiRouter);
router.use(adminApprovalsRouter);
const requireAuth = authMiddleware(resolveAuthContext);
const requireDispatchOps = [
  requireAuth,
  requireMineContext(),
  requireRoles(["ADMIN", "OPERATION_ADMIN"]),
] as const;

const requireRedispatchOps = [
  requireAuth,
  requireMineContext(),
  requireRoles(["OPERATION_ADMIN"]),
] as const;

async function runDispatchNeed(req: Request, res: Response, next: NextFunction, needId: number) {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const body = req.body as Record<string, unknown> | undefined;
    if (body && (body.driver_id != null || body.vehicle_id != null || body.owner_id != null)) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "manual_selection_forbidden",
          message: "Driver and fleet are assigned by the system only",
          requestId,
        }),
      );
    }

    const auth = (req as typeof req & { auth: AuthContext }).auth;
    const need = await needsRepo.getOperationNeed(needId);
    if (!need) {
      return next(
        new ApiError({
          statusCode: 404,
          code: "need_not_found",
          message: "Operation need not found",
          requestId,
        }),
      );
    }

    const role = normalizeRole(auth.user.role);
    if (role === "ADMIN") {
      if (auth.mineId != null && need.mine_id !== auth.mineId) {
        return next(
          new ApiError({
            statusCode: 403,
            code: "mine_mismatch",
            message: "Need does not belong to selected mine",
            requestId,
          }),
        );
      }
    } else {
      const mineId = resolveEffectiveMineId(auth, undefined, requestId);
      if (need.mine_id !== mineId) {
        return next(
          new ApiError({
            statusCode: 403,
            code: "mine_mismatch",
            message: "Need does not belong to selected mine",
            requestId,
          }),
        );
      }
    }

    const result = await appContext.dispatch.dispatchNeed(needId, auth.user.id);
    if (!result.ok) {
      const status =
        result.statusCode ??
        (result.code === "need_not_found"
          ? 404
          : result.code === "invalid_status" || result.code === "active_mission_exists"
            ? 409
            : result.code === "hourly_dispatch_not_implemented"
              ? 501
              : 400);
      const lockDetails =
        result.code === "active_mission_exists"
          ? {
              code: result.code,
              ...(result.driver_id != null ? { driver_id: result.driver_id } : {}),
              ...(result.vehicle_id != null ? { vehicle_id: result.vehicle_id } : {}),
            }
          : undefined;
      return next(
        new ApiError({
          statusCode: status,
          code: result.code,
          message: result.message,
          details: lockDetails,
          requestId,
        }),
      );
    }

    return res.json(
      success(
        {
          need: {
            ...result.need,
            created_at: result.need.created_at.toISOString(),
          },
          assignments: result.assignments,
          events: result.events,
          dispatch_mode: "manual",
          mission_ids: result.assignments.map((a) => a.mission_id),
        },
        requestId,
      ),
    );
  } catch (e) {
    next(e);
  }
}

const DISPATCH_QUEUE_NOT_IMPLEMENTED_FA =
  "صف زمان‌بندی راننده (وایرفریم ۹.۳) در فاز اول MVP فعال نیست؛ از تخصیص سیستمی استفاده کنید.";

router.get("/admin/dispatch-queue", ...requireDispatchOps, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    if (!isDispatchQueueEnabled()) {
      return next(
        new ApiError({
          statusCode: 501,
          code: "not_implemented",
          message: "Driver dispatch queue scheduling is not enabled (ENABLE_DISPATCH_QUEUE=false)",
          details: { message_fa: DISPATCH_QUEUE_NOT_IMPLEMENTED_FA },
          requestId,
        }),
      );
    }
    return next(
      new ApiError({
        statusCode: 501,
        code: "not_implemented",
        message: "Driver dispatch queue scheduling is not implemented yet (WF-QUEUE-1 spike)",
        details: { message_fa: DISPATCH_QUEUE_NOT_IMPLEMENTED_FA },
        requestId,
      }),
    );
  } catch (e) {
    next(e);
  }
});

router.get("/admin/dispatch-board", ...requireDispatchOps, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as typeof req & { auth: AuthContext }).auth;
  try {
    const mineId = resolveEffectiveMineId(auth, undefined, requestId);
    const board = await getDispatchBoard(mineId);
    return res.json(success(board, requestId));
  } catch (e) {
    next(e);
  }
});

router.post(
  "/admin/dispatch",
  ...requireDispatchOps,
  idempotencyMiddleware(),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    const parsed = z.object({ need_id: z.coerce.number().int().positive() }).safeParse(req.body ?? {});
    if (!parsed.success) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "invalid_request",
          message: "need_id required",
          requestId,
        }),
      );
    }
    return runDispatchNeed(req, res, next, parsed.data.need_id);
  },
);

router.get("/admin/users", requireAuth, requirePermission("users:manage"), async (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  try {
    const users = await appContext.userStore.listUsers();
    return res.json(
      success(
        {
          users: users.map((u) => ({
            id: u.id,
            mobile_number: u.mobile_number,
            role: u.role,
            cooperative_id: u.cooperative_id,
            is_active: u.is_active,
          })),
        },
        requestId,
      ),
    );
  } catch (e) {
    next(e);
  }
});

router.patch(
  "/admin/users/:userId/role",
  requireAuth,
  requirePermission("users:manage"),
  async (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const userId = z.coerce.number().int().positive().safeParse(req.params.userId);
    const body = z
      .object({
        role: z.string(),
        cooperative_id: z.number().int().positive().nullable().optional(),
      })
      .safeParse(req.body);

    if (!userId.success || !body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
    }

    if (!appContext.authService.validateRole(body.data.role)) {
      return next(new ApiError({ statusCode: 400, code: "invalid_role", message: "Invalid role", requestId }));
    }

    const role = body.data.role as UserRole;
    let cooperative_id: number | null | undefined = body.data.cooperative_id;

    if (isCoopScopedRole(role) && cooperative_id === undefined) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "cooperative_required",
          message: "cooperative_id is required for COOP_ADMIN and COOP_OPERATOR",
          requestId,
        }),
      );
    }
    if (!isCoopScopedRole(role)) {
      cooperative_id = null;
    }

    try {
      const updated = await appContext.userStore.updateUserRole(userId.data, role, cooperative_id);
      if (!updated) {
        return next(new ApiError({ statusCode: 404, code: "user_not_found", message: "User not found", requestId }));
      }

      appContext.auditStore.record({
        entity_type: "user",
        entity_id: String(updated.id),
        action: "ROLE_ASSIGNED",
        after_value: { role: updated.role, cooperative_id: updated.cooperative_id },
        performed_by_user_id: (req as any).auth.user.id,
        reason: "admin_role_assignment",
      });

      return res.json(success({ user: updated }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/admin/needs/:id/dispatch",
  ...requireDispatchOps,
  idempotencyMiddleware(),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    const idParsed = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!idParsed.success) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "invalid_request",
          message: "Invalid need id",
          requestId,
        }),
      );
    }
    return runDispatchNeed(req, res, next, idParsed.data);
  },
);

const redispatchBodySchema = z.object({
  reason: z.string().min(20, "reason must be at least 20 characters"),
  need_id: z.coerce.number().int().positive().optional(),
});

router.post(
  "/admin/missions/:id/redispatch",
  ...requireRedispatchOps,
  idempotencyMiddleware(),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    const missionIdParsed = z.coerce.number().int().positive().safeParse(req.params.id);
    const bodyParsed = redispatchBodySchema.safeParse(req.body ?? {});

    if (!missionIdParsed.success || !bodyParsed.success) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "invalid_request",
          message: bodyParsed.success ? "Invalid mission id" : "reason must be at least 20 characters",
          requestId,
        }),
      );
    }

    try {
      const auth = (req as typeof req & { auth: AuthContext }).auth;
      const mineId = resolveEffectiveMineId(auth, undefined, requestId);
      const mission = await appContext.mission.getMission(missionIdParsed.data);
      if (!mission) {
        return next(
          new ApiError({
            statusCode: 404,
            code: "mission_not_found",
            message: "Mission not found",
            requestId,
          }),
        );
      }
      if (mission.mine_id !== mineId) {
        return next(
          new ApiError({
            statusCode: 403,
            code: "mine_mismatch",
            message: "Mission does not belong to selected mine",
            requestId,
          }),
        );
      }

      const result = await appContext.dispatch.redispatchMission(
        missionIdParsed.data,
        bodyParsed.data.reason,
        auth.user.id,
        bodyParsed.data.need_id,
      );

      if (!result.ok) {
        return next(
          new ApiError({
            statusCode: result.statusCode ?? 400,
            code: result.code,
            message: result.message,
            requestId,
          }),
        );
      }

      return res.json(
        success(
          {
            old_mission: {
              id: result.cancelled_mission.id,
              status: result.cancelled_mission.status,
            },
            need_id: result.need_id,
            assignments: result.dispatch.assignments,
            mission_ids: result.dispatch.assignments.map((a) => a.mission_id),
            events: [...result.dispatch.events, "mission.redispatched"],
          },
          requestId,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

const ruleScopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("GLOBAL") }),
  z.object({ type: z.literal("MINE"), mine_id: z.number().int().positive() }),
  z.object({ type: z.literal("COOPERATIVE"), cooperative_id: z.number().int().positive() }),
]);

router.get("/admin/rules", requireAuth, requireRoles(["ADMIN"]), async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const key = typeof req.query.key === "string" ? req.query.key : undefined;
    const status =
      req.query.status === "ACTIVE" || req.query.status === "ARCHIVED"
        ? req.query.status
        : undefined;
    const rules = await ruleEngine.list({ key, status });
    return res.json(
      success(
        {
          rules: rules.map((r) => ({
            ...r,
            effective_from: r.effective_from.toISOString(),
            effective_to: r.effective_to?.toISOString(),
            created_at: r.created_at.toISOString(),
          })),
          known_keys: SEED_RULE_KEYS,
        },
        requestId,
      ),
    );
  } catch (e) {
    next(e);
  }
});

router.post("/admin/rules", requireAuth, requireRoles(["ADMIN"]), async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const body = z
    .object({
      key: z.string().min(1),
      value: z.union([z.number(), z.string(), z.record(z.unknown())]),
      scope: ruleScopeSchema,
      effective_from: z.string().min(8),
    })
    .safeParse(req.body);

  if (!body.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
  }

  const auth = (req as typeof req & { auth: AuthContext }).auth;
  const effectiveFrom = new Date(body.data.effective_from);
  if (Number.isNaN(effectiveFrom.getTime())) {
    return next(new ApiError({ statusCode: 400, code: "invalid_date", message: "Invalid effective_from", requestId }));
  }

  const scope = body.data.scope as FinanceRuleScope;
  const numericValue =
    typeof body.data.value === "number"
      ? body.data.value
      : typeof body.data.value === "string"
        ? Number(body.data.value)
        : body.data.value;

  try {
    const result = await ruleEngine.setActive(
      body.data.key,
      numericValue,
      scope,
      effectiveFrom,
      auth.user.id,
    );
    return res.status(201).json(
      success(
        {
          rule: {
            ...result.activated,
            effective_from: result.activated.effective_from.toISOString(),
            effective_to: result.activated.effective_to?.toISOString(),
            created_at: result.activated.created_at.toISOString(),
          },
          archived: result.archived.map((r) => ({
            ...r,
            effective_from: r.effective_from.toISOString(),
            effective_to: r.effective_to?.toISOString(),
          })),
        },
        requestId,
      ),
    );
  } catch (e) {
    next(e);
  }
});

router.get("/admin/reconciliation/issues", requireAuth, requireRoles(["ADMIN"]), async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const statusParam = typeof req.query.status === "string" ? req.query.status : undefined;
    const status =
      statusParam === "OPEN" || statusParam === "RESOLVED" ? statusParam : undefined;
    const run_id = typeof req.query.run_id === "string" ? req.query.run_id : undefined;
    const issues = await reconciliationService.listIssues({ status, run_id, limit: 500 });
    return res.json(
      success(
        {
          issues: issues.map((i) => ({
            ...i,
            created_at: i.created_at.toISOString(),
            resolved_at: i.resolved_at?.toISOString(),
          })),
        },
        requestId,
      ),
    );
  } catch (e) {
    next(e);
  }
});

router.post(
  "/admin/reconciliation/issues/:issueId/resolve",
  requireAuth,
  requireRoles(["ADMIN"]),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    const issueId = z.coerce.number().int().positive().safeParse(req.params.issueId);
    const body = z.object({ reason: z.string().min(1).max(2000) }).safeParse(req.body);

    if (!issueId.success || !body.success) {
      return next(
        new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }),
      );
    }

    const auth = (req as typeof req & { auth: AuthContext }).auth;
    try {
      const resolved = await reconciliationService.resolveIssue(
        issueId.data,
        auth.user.id,
        body.data.reason,
      );
      if (!resolved) {
        return next(
          new ApiError({
            statusCode: 404,
            code: "issue_not_found",
            message: "Issue not found or already resolved",
            requestId,
          }),
        );
      }
      return res.json(
        success(
          {
            issue: {
              ...resolved,
              created_at: resolved.created_at.toISOString(),
              resolved_at: resolved.resolved_at?.toISOString(),
            },
          },
          requestId,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

const restoreBodySchema = z.object({
  entity_type: z.string().min(1),
  entity_id: z.string().min(1),
  reason: z.string().min(1).max(2000),
});

router.post("/admin/restore", requireAuth, requireRoles(["ADMIN"]), async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const body = restoreBodySchema.safeParse(req.body);
  if (!body.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
  }

  const auth = (req as typeof req & { auth: AuthContext }).auth;
  try {
    const result = await restoreEntity({
      entity_type: body.data.entity_type,
      entity_id: body.data.entity_id,
      reason: body.data.reason,
      performed_by_user_id: auth.user.id,
    });

    if (!result.ok) {
      const status =
        result.code === "invalid_entity_type"
          ? 400
          : result.code === "not_deleted"
            ? 409
            : 404;
      return next(
        new ApiError({
          statusCode: status,
          code: result.code,
          message:
            result.code === "invalid_entity_type"
              ? "Unknown entity_type for soft-delete tables"
              : result.code === "not_deleted"
                ? "Entity is not soft-deleted"
                : "Entity not found",
          requestId,
        }),
      );
    }

    return res.json(
      success(
        {
          entity_type: result.entity_type,
          entity_id: result.entity_id,
          restored_at: result.restored_at.toISOString(),
        },
        requestId,
      ),
    );
  } catch (e) {
    next(e);
  }
});

router.post("/admin/soft-delete", requireAuth, requireRoles(["ADMIN"]), async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const body = restoreBodySchema.safeParse(req.body);
  if (!body.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
  }

  const auth = (req as typeof req & { auth: AuthContext }).auth;
  try {
    const result = await softDeleteEntity({
      entity_type: body.data.entity_type,
      entity_id: body.data.entity_id,
      reason: body.data.reason,
      performed_by_user_id: auth.user.id,
    });

    if (!result.ok) {
      const status =
        result.code === "invalid_entity_type"
          ? 400
          : result.code === "already_deleted"
            ? 409
            : 404;
      return next(
        new ApiError({
          statusCode: status,
          code: result.code,
          message:
            result.code === "invalid_entity_type"
              ? "Unknown entity_type for soft-delete tables"
              : result.code === "already_deleted"
                ? "Entity already soft-deleted"
                : "Entity not found",
          requestId,
        }),
      );
    }

    return res.json(
      success(
        {
          entity_type: result.entity_type,
          entity_id: result.entity_id,
          deleted_at: result.deleted_at.toISOString(),
        },
        requestId,
      ),
    );
  } catch (e) {
    next(e);
  }
});

export const adminRouter = router;
