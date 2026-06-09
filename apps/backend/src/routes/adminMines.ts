import { Router, type Request } from "express";
import { z } from "zod";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requireRoles } from "../middleware/rbac";
import { requireMineContext, requireSessionMineWorkspace } from "../middleware/requireMineContext";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import { resolveEffectiveMineId } from "../lib/mineScope";
import { appContext } from "../appContext";
import * as cooperativesRepo from "../repositories/cooperativesRepository";
import * as minesRepo from "../repositories/minesRepository";
import * as mineSettingsService from "../services/mineSettingsService";
import * as mineOnboardService from "../services/mineOnboardService";

const router = Router();
const requireAuth = authMiddleware(resolveAuthContext);
const requireAdminOnly = [requireAuth, requireRoles(["ADMIN"])] as const;
const requireAdminMine = [
  requireAuth,
  requireMineContext(),
  requireSessionMineWorkspace(),
  requireRoles(["ADMIN"]),
] as const;

function getAuth(req: Request): AuthContext {
  return (req as Request & { auth: AuthContext }).auth;
}

function assertRouteMineMatchesSession(
  auth: AuthContext,
  routeMineId: number,
  requestId?: string,
): number {
  const sessionMineId = resolveEffectiveMineId(auth, undefined, requestId);
  if (sessionMineId !== routeMineId) {
    throw new ApiError({
      statusCode: 403,
      code: "mine_mismatch",
      message: "mine id must match selected workspace",
      requestId,
    });
  }
  return sessionMineId;
}

const settingsQuerySchema = z.object({
  cooperative_id: z.coerce.number().int().positive().optional(),
  operation_type_code: z.string().min(1).optional(),
});

const geofenceSchema = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),
  radius_m: z.number().positive().optional(),
});

const patchSettingsSchema = z
  .object({
    platform_fee_value: z.number().positive().max(1).optional(),
    geofence: geofenceSchema.optional(),
    dispatch_mode: z.enum(["manual", "auto"]).nullable().optional(),
    community_rial_per_ton: z.number().positive().optional(),
    cooperative_id: z.number().int().positive().optional(),
    operation_type_code: z.string().min(1).optional(),
  })
  .refine(
    (b) =>
      b.platform_fee_value != null ||
      b.geofence != null ||
      b.dispatch_mode !== undefined ||
      b.community_rial_per_ton != null,
    { message: "At least one setting field required" },
  );

function mapSettingsError(e: unknown, requestId?: string): ApiError | null {
  const code = (e as { code?: string }).code;
  const msg = e instanceof Error ? e.message : "";
  if (code === "mine_not_found" || msg === "mine_not_found") {
    return new ApiError({ statusCode: 404, code: "not_found", message: "Mine not found", requestId });
  }
  if (code === "no_active_service_contract") {
    return new ApiError({
      statusCode: 404,
      code: "no_active_service_contract",
      message: "No active service contract for this mine and cooperative",
      requestId,
    });
  }
  if (code === "invalid_platform_fee") {
    return new ApiError({
      statusCode: 400,
      code: "invalid_platform_fee",
      message: "platform_fee_value must be between 0 and 1 (exclusive of 0)",
      requestId,
    });
  }
  if (code === "invalid_geofence" || code === "invalid_community_rate") {
    return new ApiError({ statusCode: 400, code: code ?? "invalid_request", message: msg || "Invalid request", requestId });
  }
  return null;
}

const mineSlugSchema = z
  .string()
  .min(2)
  .max(32)
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, "slug must be alphanumeric (dashes allowed)");

const onboardBodySchema = z.object({
  name: z.string().min(2).max(120),
  slug: mineSlugSchema,
  platform_fee: z.number().positive().max(1),
  community_rial_per_ton: z.number().positive(),
  geofence: geofenceSchema,
  cooperative_name: z.string().min(2).max(120).optional(),
  cooperative_iban: z.string().min(15).max(34).optional(),
  ore_rate_rial: z.number().positive().optional(),
  village_name: z.string().min(2).max(80).optional(),
});

function mapOnboardError(e: unknown, requestId?: string): ApiError | null {
  const code = (e as { code?: string }).code;
  const msg = e instanceof Error ? e.message : "";
  if (code === "mine_code_exists" || msg === "mine_code_exists") {
    return new ApiError({
      statusCode: 409,
      code: "mine_code_exists",
      message: "Mine code already exists",
      requestId,
    });
  }
  if (code === "invalid_platform_fee") {
    return new ApiError({
      statusCode: 400,
      code: "invalid_platform_fee",
      message: "platform_fee must be between 0 and 1 (exclusive of 0)",
      requestId,
    });
  }
  if (code === "invalid_geofence" || code === "invalid_community_rate") {
    return new ApiError({ statusCode: 400, code: code ?? "invalid_request", message: msg || "Invalid request", requestId });
  }
  return mapSettingsError(e, requestId);
}

router.get("/admin/mines", ...requireAdminOnly, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const mines = await minesRepo.listMines();
    const rows = await Promise.all(
      mines.map(async (m) => {
        const cooperatives = await cooperativesRepo.listCooperativesByMine(m.id);
        const villages = await minesRepo.listVillagesByMine(m.id);
        return {
          id: m.id,
          mine_code: m.mine_code,
          name: m.name,
          cooperatives: cooperatives.map((c) => ({ id: c.id, name: c.name, mine_id: c.mine_id })),
          villages: villages.map((v) => ({
            id: v.id,
            name: v.name,
            mine_id: m.id,
          })),
        };
      }),
    );
    return res.json(success({ mines: rows }, requestId));
  } catch (e) {
    next(e);
  }
});

router.post("/admin/mines/onboard", ...requireAdminOnly, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const auth = getAuth(req);
    const body = onboardBodySchema.safeParse(req.body);
    if (!body.success) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "invalid_request",
          message: body.error.issues[0]?.message ?? "Invalid body",
          requestId,
        }),
      );
    }

    const result = await mineOnboardService.onboardMine(auth.user.id, body.data);
    return res.status(201).json(success({ onboard: result }, requestId));
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return next(
        new ApiError({
          statusCode: 409,
          code: "mine_code_exists",
          message: "Mine code already exists",
          requestId,
        }),
      );
    }
    const mapped = mapOnboardError(e, requestId);
    if (mapped) return next(mapped);
    next(e);
  }
});

router.get("/admin/mines/:id/settings", ...requireAdminMine, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const auth = getAuth(req);
    const mineIdParsed = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!mineIdParsed.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid mine id", requestId }));
    }
    assertRouteMineMatchesSession(auth, mineIdParsed.data, requestId);

    const q = settingsQuerySchema.safeParse(req.query);
    if (!q.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid query", requestId }));
    }

    const settings = await mineSettingsService.getMineSettings(mineIdParsed.data, {
      cooperative_id: q.data.cooperative_id,
      operation_type_code: q.data.operation_type_code,
    });
    if (!settings) {
      return next(new ApiError({ statusCode: 404, code: "not_found", message: "Mine not found", requestId }));
    }

    const cooperatives = await mineSettingsService.listCooperativesForMineSettings(mineIdParsed.data);
    return res.json(success({ settings, cooperatives }, requestId));
  } catch (e) {
    const mapped = mapSettingsError(e, requestId);
    if (mapped) return next(mapped);
    next(e);
  }
});

router.patch("/admin/mines/:id/settings", ...requireAdminMine, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const auth = getAuth(req);
    const mineIdParsed = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!mineIdParsed.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid mine id", requestId }));
    }
    assertRouteMineMatchesSession(auth, mineIdParsed.data, requestId);

    const body = patchSettingsSchema.safeParse(req.body);
    if (!body.success) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "invalid_request",
          message: body.error.issues[0]?.message ?? "Invalid body",
          requestId,
        }),
      );
    }

    const settings = await mineSettingsService.patchMineSettings(
      mineIdParsed.data,
      auth.user.id,
      body.data,
    );
    return res.json(success({ settings }, requestId));
  } catch (e) {
    const mapped = mapSettingsError(e, requestId);
    if (mapped) return next(mapped);
    next(e);
  }
});

export const adminMinesRouter = router;
