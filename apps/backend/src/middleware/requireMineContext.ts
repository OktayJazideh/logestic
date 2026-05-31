import { NextFunction, Request, Response } from "express";
import { ApiError } from "../http/errors";
import * as workspaceRepo from "../repositories/workspaceMembershipsRepository";
import { isCoopScopedRole, normalizeRole } from "../types/userRole";
import type { AuthContext } from "./authMiddleware";

function getAuth(req: Request): AuthContext | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req as any).auth as AuthContext | undefined;
}

/** Operational APIs require a workspace (mine) selected on the session. */
export function requireMineContext() {
  return function (req: Request, _res: Response, next: NextFunction) {
    const auth = getAuth(req);
    if (!auth) {
      return next(
        new ApiError({
          statusCode: 401,
          code: "unauthorized",
          message: "Not authenticated",
        }),
      );
    }
    if (!auth.mineId) {
      if (normalizeRole(auth.user.role) === "ADMIN") {
        return next();
      }
      return next(
        new ApiError({
          statusCode: 400,
          code: "mine_not_selected",
          message: "Select workspace (mine) first",
        }),
      );
    }
    next();
  };
}

/**
 * Settlement/finance: operational or community workspace must match session mine.
 * (COOP_ADMIN uses COMMUNITY membership on the cooperative mine.)
 */
export function requireSessionMineWorkspace() {
  return async function (req: Request, _res: Response, next: NextFunction) {
    const auth = getAuth(req);
    const requestId = (req as { requestId?: string }).requestId;
    if (!auth) {
      return next(
        new ApiError({
          statusCode: 401,
          code: "unauthorized",
          message: "Not authenticated",
          requestId,
        }),
      );
    }
    if (!auth.mineId) {
      if (normalizeRole(auth.user.role) === "ADMIN") {
        return next();
      }
      return next(
        new ApiError({
          statusCode: 400,
          code: "mine_not_selected",
          message: "Select workspace (mine) first",
          requestId,
        }),
      );
    }
    try {
      const coopId = auth.scope?.cooperativeId ?? auth.user.cooperative_id ?? undefined;
      const role = normalizeRole(auth.user.role);
      const membershipKind = isCoopScopedRole(auth.user.role) ? ("COMMUNITY" as const) : ("OPERATIONAL" as const);
      await workspaceRepo.assertUserCanAccessMine({
        userId: auth.user.id,
        userRole: auth.user.role,
        mineId: auth.mineId,
        cooperativeId: coopId,
        membershipKind: role === "OPERATION_ADMIN" ? "OPERATIONAL" : membershipKind,
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "workspace_access_denied") {
        return next(
          new ApiError({
            statusCode: 403,
            code: "workspace_access_denied",
            message: "Workspace access denied for this mine",
            requestId,
          }),
        );
      }
      throw e;
    }
    next();
  };
}

/**
 * Ensures the session mine is an operational workspace for this user
 * (blocks HOUSEHOLD-only community membership from operational routes).
 */
export function requireOperationalWorkspace() {
  return async function (req: Request, _res: Response, next: NextFunction) {
    const auth = getAuth(req);
    const requestId = (req as { requestId?: string }).requestId;
    if (!auth) {
      return next(
        new ApiError({
          statusCode: 401,
          code: "unauthorized",
          message: "Not authenticated",
          requestId,
        }),
      );
    }
    if (!auth.mineId) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "mine_not_selected",
          message: "Select operational workspace (mine) first",
          requestId,
        }),
      );
    }
    try {
      await workspaceRepo.assertOperationalMineAccess({
        userId: auth.user.id,
        userRole: auth.user.role,
        mineId: auth.mineId,
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "workspace_access_denied") {
        return next(
          new ApiError({
            statusCode: 403,
            code: "workspace_access_denied",
            message: "Operational workspace access denied for this mine",
            requestId,
          }),
        );
      }
      throw e;
    }
    next();
  };
}

/** Weighbridge: COOP roles may use community workspace; others need operational access. */
export function requireWeighbridgeWorkspace() {
  return async function (req: Request, _res: Response, next: NextFunction) {
    const auth = getAuth(req);
    const requestId = (req as { requestId?: string }).requestId;
    if (!auth) {
      return next(
        new ApiError({
          statusCode: 401,
          code: "unauthorized",
          message: "Not authenticated",
          requestId,
        }),
      );
    }
    if (!auth.mineId) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "mine_not_selected",
          message: "Select workspace (mine) first",
          requestId,
        }),
      );
    }
    try {
      if (isCoopScopedRole(auth.user.role)) {
        await workspaceRepo.assertUserCanAccessMine({
          userId: auth.user.id,
          userRole: auth.user.role,
          cooperativeId: auth.user.cooperative_id ?? undefined,
          mineId: auth.mineId,
          membershipKind: "COMMUNITY",
        });
      } else {
        await workspaceRepo.assertOperationalMineAccess({
          userId: auth.user.id,
          userRole: auth.user.role,
          mineId: auth.mineId,
        });
      }
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "workspace_access_denied") {
        return next(
          new ApiError({
            statusCode: 403,
            code: "workspace_access_denied",
            message: "Workspace access denied for this mine",
            requestId,
          }),
        );
      }
      throw e;
    }
    next();
  };
}
