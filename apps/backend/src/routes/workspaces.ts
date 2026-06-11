import { Router } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import * as workspaceRepo from "../repositories/workspaceMembershipsRepository";
import * as cooperativesRepo from "../repositories/cooperativesRepository";
import * as minesRepo from "../repositories/minesRepository";

const router = Router();
const requireAuth = authMiddleware(resolveAuthContext);

router.get("/workspaces", requireAuth, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auth = (req as any).auth as AuthContext;
    const workspaces = await workspaceRepo.listActiveForUser(auth.user.id, auth.user.role);
    return res.json(success({ workspaces }, requestId));
  } catch (e) {
    next(e);
  }
});

router.post("/workspaces/select", requireAuth, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const body = z
    .object({
      mine_id: z.coerce.number().int().positive(),
      cooperative_id: z.coerce.number().int().positive().optional(),
      membership_kind: z.enum(["COMMUNITY", "OPERATIONAL"]).optional(),
    })
    .safeParse(req.body);

  if (!body.success) {
    return next(
      new ApiError({
        statusCode: 400,
        code: "invalid_request",
        message: "Invalid input",
        details: body.error.flatten(),
        requestId,
      }),
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auth = (req as any).auth as AuthContext;
    const mine = await minesRepo.getMine(body.data.mine_id);
    if (!mine) {
      return next(
        new ApiError({
          statusCode: 404,
          code: "mine_not_found",
          message: "Mine not found",
          requestId,
        }),
      );
    }

    const membershipKind =
      body.data.membership_kind ??
      (body.data.cooperative_id != null ? ("COMMUNITY" as const) : ("OPERATIONAL" as const));

    if (body.data.cooperative_id != null) {
      const coop = await cooperativesRepo.findCooperativeById(body.data.cooperative_id);
      if (!coop || coop.mine_id !== mine.id) {
        return next(
          new ApiError({
            statusCode: 400,
            code: "cooperative_mine_mismatch",
            message: "Cooperative does not belong to the selected mine",
            requestId,
          }),
        );
      }
    }

    try {
      await workspaceRepo.ensureDemoWorkspaceMembership({
        userId: auth.user.id,
        userRole: auth.user.role,
        mineId: mine.id,
        cooperativeId: body.data.cooperative_id,
        membershipKind,
      });
      await workspaceRepo.assertUserCanAccessMine({
        userId: auth.user.id,
        userRole: auth.user.role,
        mineId: mine.id,
        cooperativeId: body.data.cooperative_id,
        membershipKind,
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "workspace_access_denied") {
        return next(
          new ApiError({
            statusCode: 403,
            code: "workspace_access_denied",
            message: "You do not have access to this workspace",
            requestId,
          }),
        );
      }
      throw e;
    }

    await appContext.sessionStore.setMine(auth.token, mine.id);

    await appContext.auditStore.record({
      entity_type: "workspace",
      entity_id: String(mine.id),
      action: "workspace_selected",
      after_value: {
        mine_id: mine.id,
        cooperative_id: body.data.cooperative_id ?? null,
        membership_kind: membershipKind,
      },
      performed_by_user_id: auth.user.id,
      requestId,
    });

    return res.json(
      success(
        {
          mine_id: mine.id,
          cooperative_id: body.data.cooperative_id ?? null,
          membership_kind: membershipKind,
        },
        requestId,
      ),
    );
  } catch (e) {
    next(e);
  }
});

export const workspacesRouter = router;
