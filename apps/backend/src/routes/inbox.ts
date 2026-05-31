import { Router } from "express";
import { z } from "zod";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requireMineContext } from "../middleware/requireMineContext";
import * as workspaceRepo from "../repositories/workspaceMembershipsRepository";
import { isCoopScopedRole, normalizeRole } from "../types/userRole";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import {
  listRoleInboxItems,
  userCanAccessInbox,
  type RoleInboxItemType,
} from "../services/roleInboxService";

const router = Router();
const requireAuth = authMiddleware(resolveAuthContext);

const inboxTypeSchema = z.enum(["period_statement", "kyc", "objection"]);

function parseTypesQuery(query: Record<string, unknown>): RoleInboxItemType[] | undefined {
  const raw = query.types ?? query["types[]"];
  if (raw == null) return undefined;
  const parts = Array.isArray(raw) ? raw : [raw];
  const out: RoleInboxItemType[] = [];
  for (const p of parts) {
    if (typeof p !== "string") continue;
    const parsed = inboxTypeSchema.safeParse(p);
    if (parsed.success) out.push(parsed.data);
  }
  return out.length > 0 ? out : undefined;
}

function requireInboxAccess() {
  return (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    const auth = (req as import("express").Request & { auth?: AuthContext }).auth;
    if (!auth?.user?.role || !userCanAccessInbox(auth.user.role)) {
      return res.status(403).json({
        success: false,
        error: { code: "forbidden", message: "No inbox permissions for this role" },
      });
    }
    next();
  };
}

function requireMineWorkspaceAccess() {
  return async function (
    req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction,
  ) {
    const auth = (req as import("express").Request & { auth?: AuthContext }).auth;
    const requestId = (req as { requestId?: string }).requestId;
    if (!auth?.mineId) {
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
      const membershipKind = isCoopScopedRole(auth.user.role) ? ("COMMUNITY" as const) : ("OPERATIONAL" as const);
      await workspaceRepo.assertUserCanAccessMine({
        userId: auth.user.id,
        userRole: auth.user.role,
        mineId: auth.mineId,
        cooperativeId: coopId,
        membershipKind: normalizeRole(auth.user.role) === "OPERATION_ADMIN" ? "OPERATIONAL" : membershipKind,
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

router.get(
  "/inbox",
  requireAuth,
  requireMineContext(),
  requireMineWorkspaceAccess(),
  requireInboxAccess(),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    const auth = (req as typeof req & { auth: AuthContext }).auth;
    try {
      const mineId = auth.mineId!;
      const queryMine = req.query.mine_id;
      if (queryMine != null && queryMine !== "") {
        const parsed = z.coerce.number().int().positive().safeParse(queryMine);
        if (!parsed.success) {
          return next(
            new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid mine_id", requestId }),
          );
        }
        if (parsed.data !== mineId) {
          return next(
            new ApiError({
              statusCode: 400,
              code: "mine_mismatch",
              message: "mine_id must match selected workspace",
              requestId,
            }),
          );
        }
      }

      const types = parseTypesQuery(req.query as Record<string, unknown>);
      const items = await listRoleInboxItems({ auth, mineId, types });
      return res.json(success({ items, mine_id: mineId }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

export const inboxRouter = router;
