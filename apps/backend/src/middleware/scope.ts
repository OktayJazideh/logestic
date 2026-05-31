import { NextFunction, Request, Response } from "express";
import { appContext } from "../appContext";
import * as cooperativesRepo from "../repositories/cooperativesRepository";
import { normalizeRole, isCoopScopedRole, type UserRole } from "../types/userRole";
import type { AuthContext } from "./authMiddleware";

function getAuth(req: Request): AuthContext | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req as any).auth as AuthContext | undefined;
}

export type TenantScope = {
  cooperativeId?: number;
  driverId?: number;
  fleetOwnerId?: number;
};

export async function resolveTenantScope(userId: number, role: UserRole): Promise<TenantScope> {
  const scope: TenantScope = {};
  const normalized = normalizeRole(role);

  if (isCoopScopedRole(role) || normalized === "COOP_ADMIN" || normalized === "COOP_OPERATOR") {
    const user = await appContext.userStore.getById(userId);
    if (user?.cooperative_id) scope.cooperativeId = user.cooperative_id;
  }

  if (normalized === "DRIVER") {
    const driver = appContext.entities.findDriverByUserId(userId);
    if (driver) scope.driverId = driver.id;
  }

  if (normalized === "FLEET_OWNER") {
    const owner = appContext.entities.findFleetOwnerByUserId(userId);
    if (owner) scope.fleetOwnerId = owner.id;
  }

  return scope;
}

/** Reject coop-scoped users when their cooperative is not ACTIVE (ADMIN bypasses). */
export function requireActiveCooperative() {
  return async function (req: Request, res: Response, next: NextFunction) {
    const auth = getAuth(req);
    if (!auth) {
      return res.status(401).json({
        success: false,
        error: { code: "unauthorized", message: "Not authenticated" },
      });
    }
    const normalized = normalizeRole(auth.user.role);
    if (normalized === "ADMIN") return next();
    if (!isCoopScopedRole(auth.user.role)) return next();

    const coopId = auth.scope?.cooperativeId;
    if (!coopId) {
      return res.status(403).json({
        success: false,
        error: { code: "forbidden", message: "No cooperative scope assigned to user" },
      });
    }
    const cooperative = await cooperativesRepo.findCooperativeById(coopId);
    if (!cooperative || cooperative.status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        error: {
          code: "cooperative_inactive",
          message: `Cooperative is ${cooperative?.status ?? "missing"}; only ACTIVE cooperatives may use this endpoint`,
        },
      });
    }
    next();
  };
}

/** Reject if COOP-scoped user has no cooperative_id assigned. */
export function requireCooperativeScope() {
  return function (req: Request, res: Response, next: NextFunction) {
    const auth = getAuth(req);
    if (!auth) {
      return res.status(401).json({
        success: false,
        error: { code: "unauthorized", message: "Not authenticated" },
      });
    }
    const normalized = normalizeRole(auth.user.role);
    if (normalized === "ADMIN") return next();
    if (isCoopScopedRole(auth.user.role) && !auth.scope?.cooperativeId) {
      return res.status(403).json({
        success: false,
        error: { code: "forbidden", message: "No cooperative scope assigned to user" },
      });
    }
    next();
  };
}

export function filterHouseholdsByScope<T extends { cooperative_id?: number }>(
  items: T[],
  auth: AuthContext,
): T[] {
  return filterByCooperativeScope(items, auth);
}

export function filterByCooperativeScope<T extends { cooperative_id?: number }>(
  items: T[],
  auth: AuthContext,
): T[] {
  const normalized = normalizeRole(auth.user.role);
  if (normalized === "ADMIN") return items;
  if (isCoopScopedRole(auth.user.role)) {
    const coopId = auth.scope?.cooperativeId;
    if (!coopId) return [];
    return items.filter((h) => h.cooperative_id === coopId);
  }
  return items;
}

export async function assertMissionDriverScope(
  auth: AuthContext,
  missionId: number,
): Promise<{ ok: true } | { ok: false; status: number; code: string; message: string }> {
  const normalized = normalizeRole(auth.user.role);
  if (normalized === "ADMIN" || normalized === "OPERATION_ADMIN") return { ok: true };

  const driverId = auth.scope?.driverId;
  if (!driverId) {
    return { ok: false, status: 403, code: "forbidden", message: "Driver scope not found" };
  }

  const mission = await appContext.mission.getMission(missionId);
  if (!mission) {
    return { ok: false, status: 404, code: "mission_not_found", message: "Mission not found" };
  }
  if (mission.driver_id !== driverId) {
    return { ok: false, status: 403, code: "forbidden", message: "Mission not assigned to this driver" };
  }
  return { ok: true };
}

export function assertFleetOwnerScope(
  auth: AuthContext,
  fleetOwnerId: number,
): { ok: true } | { ok: false; status: number; code: string; message: string } {
  const normalized = normalizeRole(auth.user.role);
  if (normalized === "ADMIN" || normalized === "OPERATION_ADMIN") return { ok: true };

  const ownId = auth.scope?.fleetOwnerId;
  if (!ownId || ownId !== fleetOwnerId) {
    return { ok: false, status: 403, code: "forbidden", message: "Fleet owner scope mismatch" };
  }
  return { ok: true };
}
