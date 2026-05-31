import { Router } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { requireRoles } from "../middleware/rbac";
import { resolveAuthContext } from "../lib/authContext";
import * as workspaceRepo from "../repositories/workspaceMembershipsRepository";

const router = Router();

const requireAuth = authMiddleware(resolveAuthContext);

router.get("/mines", requireAuth, (_req, res) => {
  return res.json(success({ mines: appContext.mineData.listMines() }, (_req as any).requestId));
});

router.post(
  "/mine/select",
  requireAuth,
  requireRoles(["ADMIN", "COOP", "EMPLOYER", "DRIVER", "FLEET_OWNER", "HOUSEHOLD", "CONSULTANT"]),
  async (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const body = z
      .object({
        mine_id: z.coerce.number().int().positive(),
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

    const mine = appContext.mineData.getMine(body.data.mine_id);
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auth = (req as any).auth as AuthContext;
    try {
      await workspaceRepo.assertUserCanAccessMine({
        userId: auth.user.id,
        userRole: auth.user.role,
        mineId: mine.id,
        membershipKind: "OPERATIONAL",
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
    return res.json(success({ mine_id: mine.id }, requestId));
  },
);

router.get("/villages", requireAuth, (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auth = (req as any).auth as AuthContext;

  const requestedMineId = z.coerce.number().int().positive().safeParse(req.query.mine_id).success
    ? Number(req.query.mine_id)
    : auth.mineId;

  if (!requestedMineId) {
    return next(
      new ApiError({
        statusCode: 400,
        code: "mine_not_selected",
        message: "Select mine first",
        requestId,
      }),
    );
  }

  const villages = appContext.mineData.listVillagesByMine(requestedMineId);
  return res.json(success({ villages }, requestId));
});

export const mineRouter = router;

