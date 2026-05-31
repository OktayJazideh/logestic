import { NextFunction, Request, Response } from "express";
import { hasPermission } from "../types/permissions";
import { normalizeRole, type UserRole } from "../types/userRole";
import type { AuthContext } from "./authMiddleware";

function getAuth(req: Request): AuthContext | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req as any).auth as AuthContext | undefined;
}

/** At least one permission from the list. */
export function requireAnyPermission(...permissions: string[]) {
  return function (req: Request, res: Response, next: NextFunction) {
    const auth = getAuth(req);
    const role = auth?.user?.role;
    if (!role || !permissions.some((p) => hasPermission(role, p))) {
      return res.status(403).json({
        success: false,
        error: {
          code: "forbidden",
          message: `Missing one of permissions: ${permissions.join(", ")}`,
        },
      });
    }
    next();
  };
}

/** Permission-matrix gate (preferred over raw role lists). */
export function requirePermission(permission: string) {
  return function (req: Request, res: Response, next: NextFunction) {
    const auth = getAuth(req);
    const role = auth?.user?.role;
    if (!role || !hasPermission(role, permission)) {
      return res.status(403).json({
        success: false,
        error: {
          code: "forbidden",
          message: `Missing permission: ${permission}`,
        },
      });
    }
    next();
  };
}

/** Role allow-list; legacy COOP is treated as COOP_ADMIN. */
export function requireRoles(allowed: UserRole[]) {
  const normalizedAllowed = new Set(allowed.map((r) => normalizeRole(r)));
  return function (req: Request, res: Response, next: NextFunction) {
    const auth = getAuth(req);
    const role = auth?.user?.role;
    if (!role) {
      return res.status(403).json({
        success: false,
        error: { code: "forbidden", message: "Insufficient role" },
      });
    }
    const effective = normalizeRole(role);
    if (!normalizedAllowed.has(effective) && !allowed.includes(role)) {
      return res.status(403).json({
        success: false,
        error: { code: "forbidden", message: "Insufficient role" },
      });
    }
    next();
  };
}
