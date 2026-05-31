import { Router, type Request } from "express";
import { z } from "zod";
import type { MissionStatus } from "@prisma/client";
import { appContext } from "../appContext";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requirePermission, requireRoles } from "../middleware/rbac";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import { requireMineContext, requireOperationalWorkspace } from "../middleware/requireMineContext";
import * as fleetOwnerPanelRepo from "../repositories/fleetOwnerPanelRepository";

const router = Router();

const requireAuth = authMiddleware(resolveAuthContext);
const requireFo = [
  requireAuth,
  requireRoles(["FLEET_OWNER"]),
  requireMineContext(),
  requireOperationalWorkspace(),
] as const;

function getAuth(req: Request): AuthContext {
  return (req as Request & { auth: AuthContext }).auth;
}

function resolveFleetOwner(auth: AuthContext, requestId?: string) {
  const owner = appContext.entities.findFleetOwnerByUserId(auth.user.id);
  if (!owner) {
    throw new ApiError({
      statusCode: 404,
      code: "fleet_owner_not_found",
      message: "Fleet owner profile not found",
      requestId,
    });
  }
  return owner;
}

router.get("/fleet-owner/summary", ...requireFo, requirePermission("wallet:read_own"), async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const auth = getAuth(req);
    const owner = resolveFleetOwner(auth, requestId);
    const summary = await fleetOwnerPanelRepo.getFleetOwnerSummary(owner.id, auth.mineId!);
    return res.json(success(summary, requestId));
  } catch (e) {
    next(e);
  }
});

router.get("/fleet-owner/vehicles", ...requireFo, requirePermission("vehicles:read_own"), async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const auth = getAuth(req);
    const owner = resolveFleetOwner(auth, requestId);
    const vehicles = await fleetOwnerPanelRepo.listFleetOwnerVehicles(owner.id, auth.mineId!);
    return res.json(success(vehicles, requestId));
  } catch (e) {
    next(e);
  }
});

const missionsQuerySchema = z.object({
  status: z
    .enum([
      "CREATED",
      "ASSIGNED",
      "ACCEPTED",
      "ARRIVED",
      "LOADED",
      "IN_TRANSIT",
      "DELIVERED",
      "VERIFIED",
      "SETTLED",
    ])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

router.get("/fleet-owner/missions", ...requireFo, requirePermission("wallet:read_own"), async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const parsed = missionsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "invalid_request",
          message: "Invalid query",
          details: parsed.error.flatten(),
          requestId,
        }),
      );
    }

    const auth = getAuth(req);
    const owner = resolveFleetOwner(auth, requestId);
    const missions = await fleetOwnerPanelRepo.listFleetOwnerMissions(owner.id, auth.mineId!, {
      status: parsed.data.status as MissionStatus | undefined,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
    return res.json(success(missions, requestId));
  } catch (e) {
    next(e);
  }
});

export const fleetOwnerRouter = router;
