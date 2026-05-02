import { NextFunction, Request, Response } from "express";

type Role = string;

export function requireRoles(allowed: Role[]) {
  return function (req: Request, res: Response, next: NextFunction) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auth = (req as any).auth as { user?: { role?: Role } } | undefined;
    const role = auth?.user?.role;
    if (!role || !allowed.includes(role)) {
      return res.status(403).json({
        success: false,
        error: { code: "forbidden", message: "Insufficient role" },
      });
    }
    next();
  };
}

