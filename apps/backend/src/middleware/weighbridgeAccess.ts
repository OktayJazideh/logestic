import { NextFunction, Request, Response } from "express";
import { hasPermission } from "../types/permissions";
import { normalizeRole } from "../types/userRole";
import type { AuthContext } from "./authMiddleware";

export type WeighbridgeWeightEntrySource = "OPERATOR" | "AGENT" | "MANUAL";

function getAuth(req: Request): AuthContext | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req as any).auth as AuthContext | undefined;
}

/** WB-MANUAL-1: gate by entry_source — MANUAL needs weighbridge:manual_override. */
export function assertWeighbridgeWeightSubmit(
  auth: AuthContext,
  entrySource: WeighbridgeWeightEntrySource,
): { ok: true } | { ok: false; message: string } {
  if (!auth.user) {
    return { ok: false, message: "Insufficient role" };
  }
  const role = normalizeRole(auth.user.role);
  if (entrySource === "MANUAL") {
    if (!hasPermission(auth.user.role, "weighbridge:manual_override")) {
      return { ok: false, message: "Missing permission: weighbridge:manual_override" };
    }
    return { ok: true };
  }
  if (role === "COOP_OPERATOR" || role === "ADMIN" || auth.user.is_weighbridge_operator) {
    return { ok: true };
  }
  return { ok: false, message: "Weighbridge weight entry not allowed" };
}

/** COOP_OPERATOR or user flagged is_weighbridge_operator (OPERATOR/AGENT only — MANUAL checked in handler). */
export function requireWeighbridgeWeightEntry() {
  return function (req: Request, res: Response, next: NextFunction) {
    const auth = getAuth(req);
    if (!auth?.user) {
      return res.status(403).json({
        success: false,
        error: { code: "forbidden", message: "Insufficient role" },
      });
    }
    const role = normalizeRole(auth.user.role);
    if (role === "COOP_OPERATOR" || role === "ADMIN" || auth.user.is_weighbridge_operator) {
      return next();
    }
    return res.status(403).json({
      success: false,
      error: { code: "forbidden", message: "Weighbridge weight entry not allowed" },
    });
  };
}

/** GOV-WORKFLOW-1 / WB-MANUAL-1: weighbridge:approve permission (COOP_OPERATOR, OPERATION_ADMIN). */
export function requireWeighbridgeApprover() {
  return function (req: Request, res: Response, next: NextFunction) {
    const auth = getAuth(req);
    if (!auth?.user) {
      return res.status(403).json({
        success: false,
        error: { code: "forbidden", message: "Insufficient role" },
      });
    }
    if (auth.user.is_weighbridge_operator || hasPermission(auth.user.role, "weighbridge:approve")) {
      return next();
    }
    const effective = normalizeRole(auth.user.role);
    if (effective === "OPERATION_ADMIN") {
      return next();
    }
    return res.status(403).json({
      success: false,
      error: { code: "forbidden", message: "Weighbridge approval not allowed" },
    });
  };
}
