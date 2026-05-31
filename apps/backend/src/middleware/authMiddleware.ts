import { NextFunction, Request, Response } from "express";
import type { UserRole } from "../types/userRole";
import type { TenantScope } from "./scope";

export type AuthContext = {
  token: string;
  user: {
    id: number;
    mobile_number: string;
    role: UserRole;
    is_active: boolean;
    is_weighbridge_operator: boolean;
    cooperative_id?: number;
  };
  mineId?: number;
  scope?: TenantScope;
};

function parseBearer(req: Request): string | null {
  const raw = req.header("authorization");
  if (!raw) return null;
  const [scheme, token] = raw.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  if (!token) return null;
  return token;
}

export function authMiddleware(
  getAuthContext: (token: string) => AuthContext | null | Promise<AuthContext | null>,
) {
  return async function (req: Request, res: Response, next: NextFunction) {
    const token = parseBearer(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        error: { code: "unauthorized", message: "Missing bearer token" },
      });
    }

    const ctx = await getAuthContext(token);
    if (!ctx) {
      return res.status(401).json({
        success: false,
        error: { code: "unauthorized", message: "Invalid or expired token" },
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).auth = ctx;
    next();
  };
}

