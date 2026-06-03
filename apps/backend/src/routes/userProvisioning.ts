import { Router, type NextFunction } from "express";
import { z } from "zod";
import type { ProvisioningUnitType } from "@prisma/client";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requirePermission } from "../middleware/rbac";
import { resolveAuthContext } from "../lib/authContext";
import { success } from "../http/apiResponse";
import { ApiError } from "../http/errors";
import { isCoopScopedRole, normalizeRole, UserRoles, type UserRole } from "../types/userRole";
import * as provisioningRepo from "../repositories/userProvisioningRepository";
import * as provisioningService from "../services/userProvisioningService";
import { appContext } from "../appContext";
import { prismaToApiError } from "../lib/prismaErrors";

const router = Router();
const requireAuth = authMiddleware(resolveAuthContext);

function getAuth(req: { auth?: AuthContext }, requestId?: string): AuthContext {
  const auth = req.auth;
  if (!auth) {
    throw new ApiError({ statusCode: 401, code: "unauthorized", message: "Not authenticated", requestId });
  }
  return auth;
}

function forwardError(e: unknown, next: NextFunction, requestId?: string) {
  const mapped = prismaToApiError(e, requestId);
  if (mapped) return next(mapped);
  next(e);
}

function mapRequest(r: provisioningRepo.ProvisioningRequestRow) {
  return {
    id: r.id,
    status: r.status,
    unit_type: r.unit_type,
    requester_user_id: r.requester_user_id,
    cooperative_id: r.cooperative_id,
    mine_id: r.mine_id,
    target_role: r.target_role,
    mobile_number: r.mobile_number,
    national_id: r.national_id,
    full_name: r.full_name,
    note: r.note,
    rejection_reason: r.rejection_reason,
    reviewed_by_user_id: r.reviewed_by_user_id,
    reviewed_at: r.reviewed_at?.toISOString(),
    created_user_id: r.created_user_id,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  };
}

function mapUser(u: {
  id: number;
  mobile_number: string;
  national_id?: string;
  full_name?: string;
  role: string;
  cooperative_id?: number;
  is_active: boolean;
  is_weighbridge_operator?: boolean;
}) {
  return {
    id: u.id,
    mobile_number: u.mobile_number,
    national_id: u.national_id,
    full_name: u.full_name,
    role: u.role,
    cooperative_id: u.cooperative_id,
    is_active: u.is_active,
    is_weighbridge_operator: u.is_weighbridge_operator,
  };
}

const createRequestSchema = z.object({
  unit_type: z.enum(["COOPERATIVE", "MINE_OPS", "PLATFORM_SUPPORT"]).optional(),
  target_role: z.enum(UserRoles as unknown as [string, ...string[]]),
  mobile_number: z.string().min(11).max(11),
  national_id: z.string().min(5).max(20),
  full_name: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
  cooperative_id: z.number().int().positive().optional(),
  mine_id: z.number().int().positive().optional(),
});

router.post(
  "/user-provisioning/requests",
  requireAuth,
  requirePermission("users:request"),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    const body = createRequestSchema.safeParse(req.body);
    if (!body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
    }
    try {
      const auth = getAuth(req as { auth?: AuthContext }, requestId);
      const role = auth.user.role as UserRole;
      const n = normalizeRole(role);
      const cooperativeId =
        body.data.cooperative_id ?? auth.scope?.cooperativeId ?? auth.user.cooperative_id ?? undefined;
      const mineId = body.data.mine_id ?? auth.mineId ?? undefined;

      if (n === "COOP_ADMIN" && isCoopScopedRole(body.data.target_role as UserRole) && cooperativeId) {
        // default cooperative from auth
      }

      const created = await provisioningService.createProvisioningRequest({
        requesterUserId: auth.user.id,
        requesterRole: role,
        cooperativeId,
        mineId,
        unit_type: body.data.unit_type as ProvisioningUnitType | undefined,
        target_role: body.data.target_role as UserRole,
        mobile_number: body.data.mobile_number,
        national_id: body.data.national_id,
        full_name: body.data.full_name,
        note: body.data.note,
        requestId,
      });

      return res.json(success({ request: mapRequest(created) }, requestId));
    } catch (e) {
      forwardError(e, next, requestId);
    }
  },
);

router.get(
  "/user-provisioning/requests",
  requireAuth,
  requirePermission("users:request"),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    const status = z.enum(["PENDING", "APPROVED", "REJECTED"]).optional().safeParse(req.query.status);
    try {
      const auth = getAuth(req as { auth?: AuthContext }, requestId);
      const role = normalizeRole(auth.user.role as UserRole);
      let requests: provisioningRepo.ProvisioningRequestRow[];

      if (role === "COOP_ADMIN") {
        const coopId = auth.scope?.cooperativeId ?? auth.user.cooperative_id;
        if (coopId) {
          requests = await provisioningRepo.listProvisioningRequestsForCooperative(coopId, {
            status: status.success ? status.data : undefined,
          });
        } else {
          requests = await provisioningRepo.listProvisioningRequestsForRequester(auth.user.id, {
            status: status.success ? status.data : undefined,
          });
        }
      } else if (role === "OPERATION_ADMIN") {
        const mineId = auth.mineId;
        if (!mineId) {
          return next(
            new ApiError({
              statusCode: 400,
              code: "mine_required",
              message: "Select workspace (mine) first",
              requestId,
            }),
          );
        }
        requests = await provisioningRepo.listProvisioningRequestsForMine(mineId, {
          status: status.success ? status.data : undefined,
        });
      } else {
        requests = await provisioningRepo.listProvisioningRequestsForRequester(auth.user.id, {
          status: status.success ? status.data : undefined,
        });
      }

      return res.json(success({ requests: requests.map(mapRequest) }, requestId));
    } catch (e) {
      forwardError(e, next, requestId);
    }
  },
);

router.get(
  "/admin/user-provisioning/requests",
  requireAuth,
  requirePermission("users:manage"),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    const status = z.enum(["PENDING", "APPROVED", "REJECTED"]).optional().safeParse(req.query.status);
    try {
      const requests = await provisioningRepo.listProvisioningRequestsAdmin({
        status: status.success ? status.data : undefined,
      });
      return res.json(success({ requests: requests.map(mapRequest) }, requestId));
    } catch (e) {
      forwardError(e, next, requestId);
    }
  },
);

router.post(
  "/admin/user-provisioning/requests/:id/approve",
  requireAuth,
  requirePermission("users:manage"),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid id", requestId }));
    }
    try {
      const auth = getAuth(req as { auth?: AuthContext }, requestId);
      const result = await provisioningService.approveProvisioningRequest(id.data, auth.user.id, requestId);
      if (!result.request) {
        return next(new ApiError({ statusCode: 500, code: "approve_failed", message: "Approve failed", requestId }));
      }

      appContext.auditStore.record({
        entity_type: "user",
        entity_id: String(result.user.id),
        action: "USER_REQUEST_APPROVED",
        after_value: { request_id: id.data, role: result.user.role, mobile_number: result.user.mobile_number },
        performed_by_user_id: auth.user.id,
        reason: "admin_approve_provisioning",
      });

      return res.json(
        success({ request: mapRequest(result.request), user: mapUser(result.user) }, requestId),
      );
    } catch (e) {
      forwardError(e, next, requestId);
    }
  },
);

router.post(
  "/admin/user-provisioning/requests/:id/reject",
  requireAuth,
  requirePermission("users:manage"),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    const body = z.object({ reason: z.string().min(1).max(500) }).safeParse(req.body);
    if (!id.success || !body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
    }
    try {
      const auth = getAuth(req as { auth?: AuthContext }, requestId);
      const existing = await provisioningRepo.findProvisioningRequestById(id.data);
      if (!existing || existing.status !== "PENDING") {
        return next(
          new ApiError({ statusCode: 400, code: "invalid_status", message: "Request not pending", requestId }),
        );
      }
      const updated = await provisioningRepo.rejectProvisioningRequest(id.data, auth.user.id, body.data.reason);
      if (!updated) {
        return next(new ApiError({ statusCode: 500, code: "reject_failed", message: "Reject failed", requestId }));
      }
      return res.json(success({ request: mapRequest(updated) }, requestId));
    } catch (e) {
      forwardError(e, next, requestId);
    }
  },
);

export const userProvisioningRouter = router;
