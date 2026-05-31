import { Router, type Request } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requireAnyPermission, requirePermission } from "../middleware/rbac";
import { hasPermission } from "../types/permissions";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import { resolveOperationTypeDualWrite } from "../lib/operationTypeResolve";
import { idempotencyMiddleware } from "../middleware/idempotency";
import { requireMineContext, requireOperationalWorkspace } from "../middleware/requireMineContext";
import * as dispatchRepo from "../repositories/dispatchRepository";
import * as needsRepo from "../repositories/operationNeedsRepository";
import { isDispatchAuto } from "../config/env";

const router = Router();
const requireAuth = authMiddleware(resolveAuthContext);
const requireOp = [requireAuth, requireMineContext(), requireOperationalWorkspace()] as const;

function getAuth(req: Request): AuthContext {
  return (req as Request & { auth: AuthContext }).auth;
}

async function serializeNeed(n: needsRepo.OperationNeedRow) {
  const base = {
    id: n.id,
    mine_id: n.mine_id,
    employer_user_id: n.employer_user_id,
    village_id: n.village_id,
    material_type: n.material_type,
    quantity_tons: n.quantity_tons,
    equipment_type: n.equipment_type,
    location_text: n.location_text,
    estimated_hours: n.estimated_hours,
    operation_type: n.operation_type,
    operation_type_id: n.operation_type_id,
    operation_type_code: n.operation_type_code,
    operation_type_name_fa: n.operation_type_name_fa,
    note: n.note,
    status: n.status,
    created_at: n.created_at.toISOString(),
  };
  if (n.status === "DISPATCHED") {
    const mission_ids = await dispatchRepo.listMissionIdsForNeed(n.id);
    return { ...base, mission_ids };
  }
  return base;
}

const createSchema = z.object({
  village_id: z.coerce.number().int().positive(),
  material_type: z.string().min(1).max(64).optional(),
  quantity_tons: z.coerce.number().positive().optional(),
  operation_type_id: z.string().min(1).max(64).optional(),
  operation_type: z.enum(["TONNAGE", "HOURLY"]).optional(),
  equipment_type: z.string().min(1).max(64).optional(),
  location_text: z.string().min(1).max(500).optional(),
  estimated_hours: z.coerce.number().positive().optional(),
  note: z.string().max(2000).optional(),
});

const cancelSchema = z.object({
  reason: z.string().min(3).max(2000),
});

router.post(
  "/employer/needs",
  ...requireOp,
  requirePermission("needs:create"),
  idempotencyMiddleware(),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ApiError({
            statusCode: 400,
            code: "invalid_request",
            message: "Invalid input",
            details: parsed.error.flatten(),
            requestId,
          }),
        );
      }

      const auth = getAuth(req);
      const mineId = auth.mineId;
      if (!mineId) {
        return next(
          new ApiError({
            statusCode: 400,
            code: "mine_not_selected",
            message: "Select mine first",
            requestId,
          }),
        );
      }

      const villages = appContext.mineData.listVillagesByMine(mineId);
      const village = villages.find((v) => v.id === parsed.data.village_id);
      if (!village) {
        return next(
          new ApiError({
            statusCode: 400,
            code: "village_not_in_mine",
            message: "Village does not belong to selected mine",
            requestId,
          }),
        );
      }

      const resolvedType = await resolveOperationTypeDualWrite({
        operation_type_id: parsed.data.operation_type_id,
        operation_type: parsed.data.operation_type,
      });
      const isHourly = resolvedType.catalog.code === "HOURLY_EQUIPMENT";

      if (isHourly) {
        if (!parsed.data.equipment_type?.trim() || !parsed.data.location_text?.trim()) {
          return next(
            new ApiError({
              statusCode: 400,
              code: "invalid_hourly_need",
              message: "Hourly needs require equipment_type and location_text",
              requestId,
            }),
          );
        }
        if (parsed.data.quantity_tons != null) {
          return next(
            new ApiError({
              statusCode: 400,
              code: "invalid_hourly_need",
              message: "quantity_tons is not allowed for hourly equipment needs",
              requestId,
            }),
          );
        }
      } else {
        if (!parsed.data.material_type?.trim()) {
          return next(
            new ApiError({
              statusCode: 400,
              code: "invalid_haul_need",
              message: "Haul needs require material_type",
              requestId,
            }),
          );
        }
        if (parsed.data.quantity_tons == null) {
          return next(
            new ApiError({
              statusCode: 400,
              code: "invalid_haul_need",
              message: "Haul needs require quantity_tons",
              requestId,
            }),
          );
        }
        if (parsed.data.equipment_type || parsed.data.location_text || parsed.data.estimated_hours != null) {
          return next(
            new ApiError({
              statusCode: 400,
              code: "invalid_haul_need",
              message: "equipment_type, location_text, and estimated_hours are only for hourly needs",
              requestId,
            }),
          );
        }
      }

      const need = await needsRepo.createOperationNeed({
        mine_id: mineId,
        employer_user_id: auth.user.id,
        village_id: parsed.data.village_id,
        material_type: isHourly
          ? parsed.data.equipment_type!.trim()
          : parsed.data.material_type!.trim(),
        quantity_tons: isHourly ? null : parsed.data.quantity_tons,
        equipment_type: isHourly ? parsed.data.equipment_type!.trim() : undefined,
        location_text: isHourly ? parsed.data.location_text!.trim() : undefined,
        estimated_hours: isHourly ? (parsed.data.estimated_hours ?? null) : null,
        operation_type_id: parsed.data.operation_type_id,
        operation_type: parsed.data.operation_type,
        note: parsed.data.note?.trim() || undefined,
      });

      await appContext.auditStore.record({
        entity_type: "operation_need",
        entity_id: String(need.id),
        action: "need_created",
        after_value: await serializeNeed(need),
        performed_by_user_id: auth.user.id,
        requestId,
      });

      let dispatch: unknown = null;
      if (isDispatchAuto()) {
        const dispatchResult = await appContext.dispatch.dispatchNeed(need.id, auth.user.id);
        dispatch = dispatchResult.ok
          ? {
              need: {
                ...dispatchResult.need,
                created_at: dispatchResult.need.created_at.toISOString(),
              },
              assignments: dispatchResult.assignments,
              events: dispatchResult.events,
              dispatch_mode: "auto",
            }
          : { error: dispatchResult };
      }

      return res.status(201).json(
        success(
          { need: await serializeNeed(need), dispatch, dispatch_mode: isDispatchAuto() ? "auto" : "manual" },
          requestId,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/employer/needs",
  ...requireOp,
  requireAnyPermission("needs:read_own", "ops:*", "users:manage"),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    try {
      const auth = getAuth(req);
      const role = auth.user.role;
      const needs = hasPermission(role, "ops:*") || hasPermission(role, "users:manage")
        ? await needsRepo.listAllOperationNeeds()
        : await needsRepo.listOperationNeedsByEmployer(auth.user.id);

      const serialized = await Promise.all(needs.map((n) => serializeNeed(n)));
      return res.json(success({ needs: serialized }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/employer/needs/:id/cancel",
  ...requireOp,
  requireAnyPermission("needs:cancel", "ops:*"),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    try {
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

      const bodyParsed = cancelSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        return next(
          new ApiError({
            statusCode: 400,
            code: "invalid_request",
            message: "Invalid input",
            details: bodyParsed.error.flatten(),
            requestId,
          }),
        );
      }

      const auth = getAuth(req);
      const existing = await needsRepo.getOperationNeed(idParsed.data);
      if (!existing) {
        return next(
          new ApiError({
            statusCode: 404,
            code: "need_not_found",
            message: "Operation need not found",
            requestId,
          }),
        );
      }

      const role = auth.user.role;
      if (
        hasPermission(role, "needs:cancel") &&
        !hasPermission(role, "ops:*") &&
        existing.employer_user_id !== auth.user.id
      ) {
        return next(
          new ApiError({
            statusCode: 403,
            code: "forbidden",
            message: "Cannot cancel another employer's need",
            requestId,
          }),
        );
      }

      if (existing.status !== "PENDING") {
        return next(
          new ApiError({
            statusCode: 409,
            code: "invalid_status",
            message: `Cannot cancel need in status ${existing.status}`,
            requestId,
          }),
        );
      }

      const updated = await needsRepo.cancelOperationNeed(idParsed.data);
      if (!updated) {
        return next(
          new ApiError({
            statusCode: 500,
            code: "cancel_failed",
            message: "Failed to cancel need",
            requestId,
          }),
        );
      }

      await appContext.auditStore.record({
        entity_type: "operation_need",
        entity_id: String(updated.id),
        action: "need_cancelled",
        before_value: await serializeNeed(existing),
        after_value: await serializeNeed(updated),
        performed_by_user_id: auth.user.id,
        reason: bodyParsed.data.reason,
        requestId,
      });

      return res.json(success({ need: await serializeNeed(updated) }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

export const employerRouter = router;
