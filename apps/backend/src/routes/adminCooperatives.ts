import { Router } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import * as provisioningService from "../services/userProvisioningService";
import { optionalNationalIdSchema, optionalPersianNameSchema } from "../lib/identityPolicy";
import { authMiddleware } from "../middleware/authMiddleware";
import { requirePermission } from "../middleware/rbac";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import * as cooperativesRepo from "../repositories/cooperativesRepository";
import { publishEvent } from "../services/eventBus";
import type { UserRole } from "../types/userRole";
import { assertNationalIdAvailable, nationalIdConflictError } from "../lib/nationalIdEnforcement";
import { prisma } from "../db/prisma";

const router = Router();
const requireAuth = authMiddleware(resolveAuthContext);

const boardMembersSchema = z.array(
  z.object({
    name: z.string().min(1),
    role: z.string().optional(),
    national_id: z.string().optional(),
  }),
);

const createBodySchema = z.object({
  mine_id: z.number().int().positive(),
  name: z.string().min(2),
  national_id: z.string().min(5).optional(),
  registration_number: z.string().min(1).optional(),
  charter_file_url: z.string().url().optional(),
  ceo_name: z.string().min(2).optional(),
  board_members: boardMembersSchema.optional(),
  activity_scope: z.string().optional(),
  geo_area: z.string().optional(),
  iban: z.string().min(15).optional(),
});

router.post(
  "/admin/cooperatives",
  requireAuth,
  requirePermission("cooperatives:manage"),
  async (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const body = createBodySchema.safeParse(req.body);
    if (!body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
    }
    try {
      const mine = appContext.mineData.listMines().find((m) => m.id === body.data.mine_id);
      if (!mine) {
        return next(new ApiError({ statusCode: 404, code: "mine_not_found", message: "Mine not found", requestId }));
      }
      if (body.data.national_id) {
        await assertNationalIdAvailable("cooperative", null, body.data.national_id, prisma, requestId);
      }
      const cooperative = await cooperativesRepo.createCooperative(body.data);
      return res.status(201).json(success({ cooperative }, requestId));
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        return next(e);
      }
      if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
        return next(nationalIdConflictError(requestId));
      }
      next(e);
    }
  },
);

router.post(
  "/admin/cooperatives/:id/verify",
  requireAuth,
  requirePermission("cooperatives:manage"),
  async (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid id", requestId }));
    }
    try {
      const before = await cooperativesRepo.findCooperativeById(id.data);
      if (!before) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Cooperative not found", requestId }));
      }
      const updated = await cooperativesRepo.verifyCooperative(id.data);
      if (!updated) {
        return next(
          new ApiError({
            statusCode: 409,
            code: "invalid_status",
            message: "Cooperative is not pending KYC verification",
            requestId,
          }),
        );
      }
      await appContext.auditStore.record({
        entity_type: "cooperative",
        entity_id: String(updated.id),
        action: "COOPERATIVE_VERIFIED",
        before_value: { status: before.status },
        after_value: { status: updated.status },
        performed_by_user_id: (req as any).auth.user.id,
        reason: "admin_kyc_verify",
      });
      await publishEvent(
        "kyc.cooperative_verified",
        { cooperative_id: updated.id, mine_id: updated.mine_id },
        { published_by: (req as any).auth.user.id },
      );
      return res.json(success({ cooperative: updated }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/admin/cooperatives/:id/suspend",
  requireAuth,
  requirePermission("cooperatives:manage"),
  async (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    const body = z.object({ reason: z.string().min(3) }).safeParse(req.body);
    if (!id.success || !body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
    }
    try {
      const before = await cooperativesRepo.findCooperativeById(id.data);
      if (!before) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Cooperative not found", requestId }));
      }
      const updated = await cooperativesRepo.suspendCooperative(id.data);
      if (!updated) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Cooperative not found", requestId }));
      }
      await appContext.auditStore.record({
        entity_type: "cooperative",
        entity_id: String(updated.id),
        action: "COOPERATIVE_SUSPENDED",
        before_value: { status: before.status },
        after_value: { status: updated.status },
        performed_by_user_id: (req as any).auth.user.id,
        reason: body.data.reason,
      });
      return res.json(success({ cooperative: updated }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/admin/cooperatives/:id/invite-manager",
  requireAuth,
  requirePermission("cooperatives:manage"),
  async (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    const body = z
      .object({
        mobile_number: z.string().regex(/^09\d{9}$/),
        national_id: optionalNationalIdSchema,
        full_name: optionalPersianNameSchema,
        role: z.enum(["COOP_ADMIN", "COOP_OPERATOR"]),
      })
      .safeParse(req.body);
    if (!id.success || !body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
    }
    try {
      const cooperative = await cooperativesRepo.findCooperativeById(id.data);
      if (!cooperative) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Cooperative not found", requestId }));
      }
      const user = await provisioningService.createUserDirect({
        mobile_number: body.data.mobile_number,
        national_id: body.data.national_id,
        role: body.data.role as UserRole,
        cooperative_id: cooperative.id,
        full_name: body.data.full_name,
        is_active: true,
        requestId,
      });
      await appContext.auditStore.record({
        entity_type: "user",
        entity_id: String(user.id),
        action: "COOP_MANAGER_INVITED",
        after_value: { role: user.role, cooperative_id: cooperative.id, mobile_number: user.mobile_number },
        performed_by_user_id: (req as any).auth.user.id,
        reason: `invite_${body.data.role}`,
      });
      return res.json(success({ user }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

export const adminCooperativesRouter = router;
