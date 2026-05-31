import { Router } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { requirePermission } from "../middleware/rbac";
import { assertMissionDriverScope } from "../middleware/scope";
import { resolveAuthContext } from "../lib/authContext";
import { DRIVER_STEP_TARGETS } from "../lib/missionFsm";
import { idempotencyMiddleware } from "../middleware/idempotency";
import { requireMineContext, requireOperationalWorkspace } from "../middleware/requireMineContext";
import { resolveFactoryGeofence, resolveMineGeofence } from "../services/geofenceService";

const router = Router();

const requireAuth = authMiddleware(resolveAuthContext);
const requireOp = [requireAuth, requireMineContext(), requireOperationalWorkspace()] as const;

router.get("/driver/me", requireAuth, (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const auth = (req as any).auth as AuthContext;

  try {
    if (auth.user.role !== "DRIVER") {
      return next(
        new ApiError({
          statusCode: 403,
          code: "forbidden",
          message: "Driver profile is only available for DRIVER role",
          requestId,
        }),
      );
    }

    const driver = appContext.entities.findDriverByUserId(auth.user.id);
    return res.json(
      success(
        {
          user_id: auth.user.id,
          mobile_number: auth.user.mobile_number,
          driver_id: driver?.id ?? null,
          kyc_status: driver?.status ?? "PENDING",
          full_name: driver?.full_name ?? null,
          cooperative_id: driver?.cooperative_id ?? null,
        },
        requestId,
      ),
    );
  } catch (e) {
    next(e);
  }
});

router.get("/driver/dashboard", ...requireOp, requirePermission("mission:read_own"), async (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const auth = (req as any).auth as AuthContext;
  const mineId = auth.mineId;

  try {
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

    const dashboard = await appContext.mission.getDriverDashboard(driver.id, mineId);
    return res.json(success(dashboard, requestId));
  } catch (e) {
    next(e);
  }
});

router.get("/driver/missions", ...requireOp, requirePermission("mission:read_own"), async (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const auth = (req as any).auth as AuthContext;
  const mineId = auth.mineId;

  try {
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

    const missions = await appContext.mission.listDriverMissionsForApi(driver.id, mineId);
    return res.json(success({ missions }, requestId));
  } catch (e) {
    next(e);
  }
});

router.get(
  "/driver/missions/:missionId",
  ...requireOp,
  requirePermission("mission:read_own"),
  async (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;
    const mineId = auth.mineId;

    try {
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

      const scopeCheck = await assertMissionDriverScope(auth, missionId.data);
      if (!scopeCheck.ok) {
        return next(
          new ApiError({
            statusCode: scopeCheck.status,
            code: scopeCheck.code,
            message: scopeCheck.message,
            requestId,
          }),
        );
      }

      const mission = await appContext.mission.getDriverMissionForApi(
        driver.id,
        missionId.data,
        mineId,
      );
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

      return res.json(success({ mission }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

const StepSchema = z.enum(DRIVER_STEP_TARGETS);

router.post(
  "/driver/missions/:missionId/steps",
  ...requireOp,
  requirePermission("mission:execute_steps"),
  idempotencyMiddleware(),
  async (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;

    try {
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

      const body = z
        .object({
          step: StepSchema,
          latitude: z.number().optional(),
          longitude: z.number().optional(),
          accuracy_m: z.number().nonnegative().optional(),
          distance_m: z.number().nonnegative().optional(),
          receipt_photo_url: z.string().url().optional(),
          receipt_photo_base64: z.string().max(2_800_000).optional(),
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

      const scopeCheck = await assertMissionDriverScope(auth, missionId.data);
      if (!scopeCheck.ok) {
        return next(
          new ApiError({
            statusCode: scopeCheck.status,
            code: scopeCheck.code,
            message: scopeCheck.message,
            requestId,
          }),
        );
      }

      const mission = await appContext.mission.getMission(missionId.data);
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

      const r = await appContext.mission.driverUpdateStep({
        missionId: mission.id,
        driverId: driver.id,
        step: body.data.step,
        latitude: body.data.latitude,
        longitude: body.data.longitude,
        accuracy_m: body.data.accuracy_m,
        distance_m: body.data.distance_m,
        receipt_photo_url: body.data.receipt_photo_url,
        receipt_photo_base64: body.data.receipt_photo_base64,
      });

      if (!r.ok) {
        const statusCode =
          r.reason === "forbidden"
            ? 403
            : r.reason === "location_required" ||
                r.reason === "outside_geofence" ||
                r.reason === "geofence_not_configured"
              ? 400
              : 409;
        const code =
          r.reason === "location_required"
            ? "location_required"
            : r.reason === "outside_geofence"
              ? "outside_geofence"
              : r.reason === "geofence_not_configured"
                ? "geofence_not_configured"
                : r.reason === "forbidden"
                  ? "forbidden"
                  : "invalid_transition";
        const message =
          r.reason === "location_required"
            ? "Latitude and longitude required for this step"
            : r.reason === "outside_geofence"
              ? "Driver location is outside the allowed geofence"
              : r.reason === "geofence_not_configured"
                ? "Geofence is not configured for this site"
                : "Invalid mission step transition";
        return next(
          new ApiError({
            statusCode,
            code,
            message,
            details:
              r.reason === "outside_geofence"
                ? {
                    reason: r.reason,
                    distance_m: r.distance_m,
                    radius_m: r.radius_m,
                    client_distance_m: body.data.distance_m,
                    accuracy_m: body.data.accuracy_m,
                  }
                : { reason: r.reason },
            requestId,
          }),
        );
      }

      return res.json(success({ mission: r.mission }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/driver/missions/:missionId/geofence",
  ...requireOp,
  requirePermission("mission:read_own"),
  async (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;

    try {
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

      const target = z.enum(["mine", "factory"]).safeParse(req.query.target);
      if (!target.success) {
        return next(
          new ApiError({
            statusCode: 400,
            code: "invalid_target",
            message: 'Query "target" must be mine or factory',
            requestId,
          }),
        );
      }

      const scopeCheck = await assertMissionDriverScope(auth, missionId.data);
      if (!scopeCheck.ok) {
        return next(
          new ApiError({
            statusCode: scopeCheck.status,
            code: scopeCheck.code,
            message: scopeCheck.message,
            requestId,
          }),
        );
      }

      const mission = await appContext.mission.getMission(missionId.data);
      if (!mission) {
        return next(new ApiError({ statusCode: 404, code: "mission_not_found", message: "Mission not found", requestId }));
      }

      const config =
        target.data === "mine"
          ? await resolveMineGeofence(mission.mine_id)
          : await resolveFactoryGeofence(mission.mine_id);

      if (!config) {
        return next(
          new ApiError({
            statusCode: 404,
            code: "geofence_not_configured",
            message: "Geofence coordinates are not configured",
            requestId,
          }),
        );
      }

      return res.json(success({ geofence: config }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/driver/missions/:missionId/ticket",
  ...requireOp,
  requirePermission("mission:read_own"),
  async (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;

    try {
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

      const scopeCheck = await assertMissionDriverScope(auth, missionId.data);
      if (!scopeCheck.ok) {
        return next(
          new ApiError({
            statusCode: scopeCheck.status,
            code: scopeCheck.code,
            message: scopeCheck.message,
            requestId,
          }),
        );
      }

      const mission = await appContext.mission.getMission(missionId.data);
      if (!mission) {
        return next(new ApiError({ statusCode: 404, code: "mission_not_found", message: "Mission not found", requestId }));
      }

      const ticket = await appContext.mission.getTicketForMission(mission.id);
      return res.json(success({ ticket }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/driver/missions/:missionId/weighbridge-status",
  ...requireOp,
  requirePermission("mission:read_own"),
  async (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;

    try {
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

      const scopeCheck = await assertMissionDriverScope(auth, missionId.data);
      if (!scopeCheck.ok) {
        return next(
          new ApiError({
            statusCode: scopeCheck.status,
            code: scopeCheck.code,
            message: scopeCheck.message,
            requestId,
          }),
        );
      }

      const mission = await appContext.mission.getMission(missionId.data);
      if (!mission) {
        return next(new ApiError({ statusCode: 404, code: "mission_not_found", message: "Mission not found", requestId }));
      }

      const status = await appContext.mission.getDriverWeighbridgeStatus(mission.id);
      if (!status) {
        return next(new ApiError({ statusCode: 404, code: "mission_not_found", message: "Mission not found", requestId }));
      }

      return res.json(success(status, requestId));
    } catch (e) {
      next(e);
    }
  },
);

export const driverRouter = router;
