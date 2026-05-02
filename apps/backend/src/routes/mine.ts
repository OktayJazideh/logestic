import { Router } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { requireRoles } from "../middleware/rbac";

const router = Router();

const getAuthContext = (token: string): AuthContext | null => {
  const u = appContext.authService.getUserFromSession(token);
  if (!u) return null;
  const session = appContext.sessionStore.getSession(token);
  return { token, user: u, mineId: session?.mineId };
};

const requireAuth = authMiddleware(getAuthContext);

router.get("/mines", requireAuth, (_req, res) => {
  return res.json(success({ mines: appContext.mineData.listMines() }, (_req as any).requestId));
});

router.post(
  "/mine/select",
  requireAuth,
  requireRoles(["ADMIN", "COOP", "EMPLOYER", "DRIVER", "FLEET_OWNER", "HOUSEHOLD", "CONSULTANT"]),
  (req, res, next) => {
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
    appContext.sessionStore.setMine(auth.token, mine.id);
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

