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
import { adminMinesRouter } from "./adminMines";
import { ruleEngine } from "../services/ruleEngine";
import { SEED_RULE_KEYS } from "../lib/seedFinanceRules";
import type { FinanceRuleScope } from "../repositories/financeRulesRepository";
import { reconciliationService } from "../services/reconciliationService";
import { restoreEntity, softDeleteEntity } from "../services/softDeleteService";
import * as provisioningService from "../services/userProvisioningService";
import * as usersRepo from "../repositories/usersRepository";
import {
  optionalIbanSchema,
  optionalNationalIdSchema,
  optionalPersianNameSchema,
} from "../lib/identityPolicy";
import { requireMineContext } from "../middleware/requireMineContext";
import { resolveEffectiveMineId } from "../lib/mineScope";
import { isDispatchQueueEnabled } from "../config/env";
import { resolveDispatchMode } from "../lib/dispatchMode";
import { getDispatchBoard } from "../services/dispatchBoardService";
import * as needsRepo from "../repositories/operationNeedsRepository";

const router = Router();
router.use(adminCooperativesRouter);
router.use(adminFinanceRouter);
router.use(adminKpiRouter);
router.use(adminApprovalsRouter);
router.use(adminMinesRouter);
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

    const dispatchMode = await resolveDispatchMode(result.need.mine_id);
    return res.json(
      success(
        {
          need: {
            ...result.need,
            created_at: result.need.created_at.toISOString(),
          },
          assignments: result.assignments,
          events: result.events,
          dispatch_mode: dispatchMode.effective,
          dispatch_mode_source: dispatchMode.source,
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

function mapAdminUser(u: {
  id: number;
  mobile_number: string;
  national_id?: string;
  bank_iban?: string;
  village_id?: number;
  village_name?: string;
  full_name?: string;
  role: string;
  cooperative_id?: number;
  cooperative_name?: string;
  mine_id?: number;
  mine_code?: string;
  mine_name?: string;
  is_active: boolean;
  is_weighbridge_operator?: boolean;
}) {
  return {
    id: u.id,
    mobile_number: u.mobile_number,
    national_id: u.national_id,
    bank_iban: u.bank_iban,
    village_id: u.village_id,
    village_name: u.village_name,
    full_name: u.full_name,
    role: u.role,
    cooperative_id: u.cooperative_id,
    cooperative_name: u.cooperative_name,
    mine_id: u.mine_id,
    mine_code: u.mine_code,
    mine_name: u.mine_name,
    is_active: u.is_active,
    is_weighbridge_operator: u.is_weighbridge_operator,
  };
}

const adminUsersListQuerySchema = z.object({
  include_deleted: z.enum(["true", "false"]).optional(),
  mine_id: z.coerce.number().int().positive().optional(),
  cooperative_id: z.coerce.number().int().positive().optional(),
  village_id: z.coerce.number().int().positive().optional(),
  role: z.string().optional(),
  q: z.string().max(80).optional(),
});

router.get("/admin/users", requireAuth, requirePermission("users:manage"), async (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const query = adminUsersListQuerySchema.safeParse(req.query);
  if (!query.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid query", requestId }));
  }
  if (query.data.role && !appContext.authService.validateRole(query.data.role)) {
    return next(new ApiError({ statusCode: 400, code: "invalid_role", message: "Invalid role", requestId }));
  }
  try {
    const users = await usersRepo.listUsersForAdmin({
      includeDeleted: query.data.include_deleted === "true",
      mine_id: query.data.mine_id,
      cooperative_id: query.data.cooperative_id,
      village_id: query.data.village_id,
      role: query.data.role as UserRole | undefined,
      q: query.data.q,
    });
    return res.json(
      success(
        {
          users: users.map(mapAdminUser),
        },
        requestId,
      ),
    );
  } catch (e) {
    next(e);
  }
});

router.post("/admin/users", requireAuth, requirePermission("users:manage"), async (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
    const body = z
    .object({
      mobile_number: z.string().regex(provisioningService.MOBILE_REGEX),
      national_id: optionalNationalIdSchema,
      bank_iban: optionalIbanSchema,
      village_id: z.number().int().positive().nullable().optional(),
      role: z.string(),
      cooperative_id: z.number().int().positive().nullable().optional(),
      mine_id: z.number().int().positive().nullable().optional(),
      full_name: optionalPersianNameSchema,
      is_active: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
  }
  if (!appContext.authService.validateRole(body.data.role)) {
    return next(new ApiError({ statusCode: 400, code: "invalid_role", message: "Invalid role", requestId }));
  }
  try {
    const user = await provisioningService.createUserDirect({
      mobile_number: body.data.mobile_number,
      national_id: body.data.national_id,
      bank_iban: body.data.bank_iban,
      village_id: body.data.village_id,
      role: body.data.role as UserRole,
      cooperative_id: body.data.cooperative_id,
      mine_id: body.data.mine_id,
      full_name: body.data.full_name,
      is_active: body.data.is_active ?? true,
      requestId,
    });
    appContext.auditStore.record({
      entity_type: "user",
      entity_id: String(user.id),
      action: "USER_CREATED",
      after_value: { role: user.role, mobile_number: user.mobile_number, national_id: user.national_id },
      performed_by_user_id: (req as any).auth.user.id,
      reason: "admin_create_user",
    });
    return res.status(201).json(success({ user: mapAdminUser(user) }, requestId));
  } catch (e) {
    next(e);
  }
});

router.patch(
  "/admin/users/:userId",
  requireAuth,
  requirePermission("users:manage"),
  async (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const userId = z.coerce.number().int().positive().safeParse(req.params.userId);
    const body = z
      .object({
        role: z.string().optional(),
        cooperative_id: z.number().int().positive().nullable().optional(),
        mine_id: z.number().int().positive().nullable().optional(),
        bank_iban: optionalIbanSchema.nullable().optional(),
        village_id: z.number().int().positive().nullable().optional(),
        is_active: z.boolean().optional(),
        full_name: optionalPersianNameSchema.nullable().optional(),
        national_id: optionalNationalIdSchema.nullable().optional(),
      })
      .safeParse(req.body);
    if (!userId.success || !body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
    }
    if (body.data.role && !appContext.authService.validateRole(body.data.role)) {
      return next(new ApiError({ statusCode: 400, code: "invalid_role", message: "Invalid role", requestId }));
    }
    try {
      const updated = await provisioningService.updateUserAdmin(
        userId.data,
        {
          role: body.data.role as UserRole | undefined,
          cooperative_id: body.data.cooperative_id,
          mine_id: body.data.mine_id,
          bank_iban: body.data.bank_iban,
          village_id: body.data.village_id,
          is_active: body.data.is_active,
          full_name: body.data.full_name,
          national_id: body.data.national_id,
        },
        requestId,
      );
      if (!updated) {
        return next(new ApiError({ statusCode: 404, code: "user_not_found", message: "User not found", requestId }));
      }
      appContext.auditStore.record({
        entity_type: "user",
        entity_id: String(updated.id),
        action: "USER_UPDATED",
        after_value: mapAdminUser(updated),
        performed_by_user_id: (req as any).auth.user.id,
        reason: "admin_update_user",
      });
      return res.json(success({ user: mapAdminUser(updated) }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  "/admin/users/:userId",
  requireAuth,
  requirePermission("users:manage"),
  async (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const userId = z.coerce.number().int().positive().safeParse(req.params.userId);
    if (!userId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
    }
    try {
      const performerId = (req as any).auth.user.id as number;
      if (performerId === userId.data) {
        return next(
          new ApiError({ statusCode: 400, code: "self_delete", message: "Cannot delete your own account", requestId }),
        );
      }
      const deleted = await provisioningService.softDeleteUserAdmin(userId.data, requestId);
      if (!deleted) {
        return next(new ApiError({ statusCode: 404, code: "user_not_found", message: "User not found", requestId }));
      }
      appContext.auditStore.record({
        entity_type: "user",
        entity_id: String(deleted.id),
        action: "USER_SOFT_DELETED",
        after_value: { is_active: false, deleted: true },
        performed_by_user_id: performerId,
        reason: "admin_soft_delete_user",
      });
      return res.json(success({ user: mapAdminUser(deleted) }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

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
