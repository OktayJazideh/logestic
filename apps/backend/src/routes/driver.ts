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

router.get("/driver/missions", requireAuth, requireRoles(["DRIVER"]), (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const auth = (req as any).auth as AuthContext;
  const mineId = auth.mineId;

  const driver = appContext.entities.findDriverByUserId(auth.user.id);
  if (!driver || driver.status !== "APPROVED") {
    return next(
      new ApiError({
        statusCode: 403,
        code: "driver_not_approved",
        message: "Driver is not approved",
        requestId,
      }),
    );
  }

  const missions = appContext.mission.listDriverMissions(driver.id, mineId);
  return res.json(success({ missions }, requestId));
});

const StepSchema = z.enum(["ASSIGNED", "LOADING", "ON_THE_WAY", "UNLOADING", "COMPLETED"]);

router.post(
  "/driver/missions/:missionId/steps",
  requireAuth,
  requireRoles(["DRIVER"]),
  (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;
    const driver = appContext.entities.findDriverByUserId(auth.user.id);
    if (!driver || driver.status !== "APPROVED") {
      return next(
        new ApiError({
          statusCode: 403,
          code: "driver_not_approved",
          message: "Driver is not approved",
          requestId,
        }),
      );
    }

    const missionId = z.coerce.number().int().positive().safeParse(req.params.missionId);
    if (!missionId.success) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "invalid_mission_id",
          message: "Invalid missionId",
          requestId,
        }),
      );
    }

    const body = z.object({ step: StepSchema }).safeParse(req.body);
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

    const mission = appContext.mission.getMission(missionId.data);
    if (!mission) {
      return next(
        new ApiError({
          statusCode: 404,
          code: "mission_not_found",
          message: "Mission not found",
          requestId,
        }),
      );
    }

    // mine-based access
    if (auth.mineId && mission.mine_id !== auth.mineId) {
      return next(
        new ApiError({
          statusCode: 403,
          code: "mine_mismatch",
          message: "Mission does not belong to selected mine",
          requestId,
        }),
      );
    }

    const r = appContext.mission.driverUpdateStep({
      missionId: mission.id,
      driverId: driver.id,
      step: body.data.step,
    });

    if (!r.ok) {
      return next(
        new ApiError({
          statusCode: 409,
          code: "invalid_transition",
          message: "Invalid mission step transition",
          details: { reason: r.reason },
          requestId,
        }),
      );
    }

    return res.json(success({ mission: r.mission }, requestId));
  },
);

router.get(
  "/driver/missions/:missionId/ticket",
  requireAuth,
  requireRoles(["DRIVER"]),
  (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;
    const driver = appContext.entities.findDriverByUserId(auth.user.id);
    if (!driver || driver.status !== "APPROVED") {
      return next(
        new ApiError({
          statusCode: 403,
          code: "driver_not_approved",
          message: "Driver is not approved",
          requestId,
        }),
      );
    }

    const missionId = z.coerce.number().int().positive().safeParse(req.params.missionId);
    if (!missionId.success) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "invalid_mission_id",
          message: "Invalid missionId",
          requestId,
        }),
      );
    }

    const mission = appContext.mission.getMission(missionId.data);
    if (!mission) {
      return next(new ApiError({ statusCode: 404, code: "mission_not_found", message: "Mission not found", requestId }));
    }
    if (mission.driver_id !== driver.id) {
      return next(new ApiError({ statusCode: 403, code: "forbidden", message: "Forbidden", requestId }));
    }

    const ticket = appContext.mission.getTicketForMission(mission.id);
    return res.json(success({ ticket }, requestId));
  },
);

export const driverRouter = router;

