import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { ApprovalStatus } from "@prisma/client";
import { appContext } from "../appContext";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requirePermission } from "../middleware/rbac";
import { requireActiveCooperative, requireCooperativeScope } from "../middleware/scope";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import {
  assertCanResubmit,
  assertCoopEntityScope,
  canApproveFrom,
  canRejectFrom,
  canRequestCorrectionFrom,
  canResubmitFrom,
  canSuspendFrom,
  getHouseholdApprovalQuorum,
  hasKycReviewPermission,
  isCoopKycStaff,
  recordHouseholdApprovalAudit,
  recordKycAudit,
  recordKycResubmitAudit,
  type KycEntityKind,
} from "../lib/kycWorkflow";
import { publishEvent } from "../services/eventBus";
import { queryKycInboxPaginated, type KycInboxEntityKind, type KycInboxStatus } from "../lib/kycInbox";
import { normalizeRole } from "../types/userRole";
import type { Household, Driver, FleetOwner, Vehicle } from "../stores/entitiesStore";
import { assertNationalIdAvailable } from "../lib/nationalIdEnforcement";
import { recordIbanAudit } from "../lib/ibanAudit";
import { assertIbanAvailable } from "../lib/ibanEnforcement";
import { persianNameSchema } from "../lib/persianText";
import { prisma } from "../db/prisma";
import { toBig } from "../repositories/id";
import * as householdApprovalsRepo from "../repositories/householdApprovalsRepository";
import * as walletsRepo from "../repositories/walletsRepository";
import * as householdsRepo from "../repositories/householdsRepository";
import * as driversRepo from "../repositories/driversRepository";
import * as fleetOwnersRepo from "../repositories/fleetOwnersRepository";
import * as vehiclesRepo from "../repositories/vehiclesRepository";

const router = Router();
const requireAuth = authMiddleware(resolveAuthContext);

const reasonSchema = z.object({ reason: z.string().min(3) });
const correctionReasonSchema = z.object({ reason: z.string().min(10) });
const inboxStatusSchema = z.enum(["PENDING", "NEEDS_CORRECTION"]);
const entityTypeSchema = z.enum(["household", "driver", "fleet_owner", "vehicle"]);
const sortSchema = z
  .string()
  .regex(/^(created_at|name|status):(asc|desc)$/)
  .default("created_at:desc");

function parseInboxQuery(req: Request) {
  const statusParam = typeof req.query.status === "string" ? req.query.status : "PENDING";
  const statusParsed = inboxStatusSchema.safeParse(statusParam);
  if (!statusParsed.success) {
    return { ok: false as const, message: "status must be PENDING or NEEDS_CORRECTION" };
  }

  const villageId = z.coerce.number().int().positive().optional().safeParse(req.query.village_id);
  if (!villageId.success) {
    return { ok: false as const, message: "invalid village_id" };
  }

  const entityTypeRaw = typeof req.query.entity_type === "string" ? req.query.entity_type : undefined;
  const entityTypeParsed = entityTypeRaw ? entityTypeSchema.safeParse(entityTypeRaw) : { success: true as const, data: undefined };
  if (!entityTypeParsed.success) {
    return { ok: false as const, message: "invalid entity_type" };
  }

  const fromDateRaw = typeof req.query.from_date === "string" ? req.query.from_date : undefined;
  const toDateRaw = typeof req.query.to_date === "string" ? req.query.to_date : undefined;
  const fromDate = fromDateRaw ? new Date(fromDateRaw) : undefined;
  const toDate = toDateRaw ? new Date(toDateRaw) : undefined;
  if (fromDateRaw && Number.isNaN(fromDate!.getTime())) {
    return { ok: false as const, message: "invalid from_date" };
  }
  if (toDateRaw && Number.isNaN(toDate!.getTime())) {
    return { ok: false as const, message: "invalid to_date" };
  }

  const pageParsed = z.coerce.number().int().min(1).default(1).safeParse(req.query.page ?? "1");
  const limitParsed = z.coerce.number().int().min(1).max(100).default(20).safeParse(req.query.limit ?? "20");
  if (!pageParsed.success || !limitParsed.success) {
    return { ok: false as const, message: "invalid page or limit" };
  }

  const sortRaw = typeof req.query.sort === "string" ? req.query.sort : "created_at:desc";
  const sortParsed = sortSchema.safeParse(sortRaw);
  if (!sortParsed.success) {
    return { ok: false as const, message: "sort must be field:asc|desc (created_at|name|status)" };
  }
  const [sortField, sortDir] = sortParsed.data.split(":") as ["created_at" | "name" | "status", "asc" | "desc"];

  return {
    ok: true as const,
    status: statusParsed.data as KycInboxStatus,
    villageId: villageId.data,
    entityType: entityTypeParsed.data as KycInboxEntityKind | undefined,
    fromDate,
    toDate,
    page: pageParsed.data,
    limit: limitParsed.data,
    sortField,
    sortDir,
  };
}

function getAuth(req: Request): AuthContext {
  return (req as Request & { auth: AuthContext }).auth;
}

function requireKycReview() {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = getAuth(req);
    if (!hasKycReviewPermission(auth.user.role)) {
      return res.status(403).json({
        success: false,
        error: { code: "forbidden", message: "Missing kyc:approve or kyc:review permission" },
      });
    }
    next();
  };
}

function requireCoopKycStaff() {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = getAuth(req);
    const role = normalizeRole(auth.user.role);
    if (role === "ADMIN") return next();
    if (isCoopKycStaff(auth.user.role) && auth.scope?.cooperativeId) return next();
    return res.status(403).json({
      success: false,
      error: { code: "forbidden", message: "COOP_ADMIN or COOP_OPERATOR in cooperative scope required" },
    });
  };
}

router.get(
  "/coop/kyc/inbox",
  requireAuth,
  requirePermission("members:read"),
  requireCooperativeScope(),
  requireActiveCooperative(),
  async (req, res, next) => {
    const requestId = (req as Request & { requestId?: string }).requestId;
    const auth = getAuth(req);
    try {
      const coopId = auth.scope?.cooperativeId;
      if (!coopId && normalizeRole(auth.user.role) !== "ADMIN") {
        return next(new ApiError({ statusCode: 403, code: "forbidden", message: "No cooperative scope", requestId }));
      }
      const parsed = parseInboxQuery(req);
      if (!parsed.ok) {
        return next(
          new ApiError({
            statusCode: 400,
            code: "invalid_request",
            message: parsed.message,
            requestId,
          }),
        );
      }
      const result = coopId
        ? await queryKycInboxPaginated({
            coopId,
            status: parsed.status,
            villageId: parsed.villageId,
            entityType: parsed.entityType,
            fromDate: parsed.fromDate,
            toDate: parsed.toDate,
            page: parsed.page,
            limit: parsed.limit,
            sortField: parsed.sortField,
            sortDir: parsed.sortDir,
          })
        : { items: [], total: 0, page: parsed.page, limit: parsed.limit };
      return res.json(success({ ...result, status: parsed.status }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

// --- Households ---
const householdRequestSchema = z.object({
  cooperative_id: z.number().int().positive(),
  village_id: z.number().int().positive(),
  head_name: persianNameSchema,
  national_id: z.string().min(5),
  bank_iban: z.string().min(15).optional(),
});

router.post("/coop/households/request", requireAuth, async (req, res, next) => {
  const requestId = (req as Request & { requestId?: string }).requestId;
  const auth = getAuth(req);
  const body = householdRequestSchema.safeParse(req.body);
  if (!body.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
  }
  try {
    const before = appContext.entities.findHouseholdByUserId(auth.user.id);
    const nationalId = await assertNationalIdAvailable(
      "household",
      before?.id ?? null,
      body.data.national_id,
      prisma,
      requestId,
    );
    let bank_iban: string | undefined;
    if (body.data.bank_iban) {
      bank_iban = await assertIbanAvailable(
        "household",
        body.data.bank_iban,
        before?.id,
        prisma,
        requestId,
      );
    }
    const row = await appContext.entities.upsertHousehold({
      user_id: auth.user.id,
      village_id: body.data.village_id,
      cooperative_id: body.data.cooperative_id,
      head_name: body.data.head_name,
      national_id: nationalId,
      bank_iban,
      status: "PENDING",
    });
    await recordKycAudit({
      entity_type: "household",
      entity_id: row.id,
      before: before ?? null,
      after: row,
      performed_by_user_id: auth.user.id,
    });
    return res.status(201).json(success({ household: row }, requestId));
  } catch (e) {
    next(e);
  }
});

function householdAction(
  action: "approve" | "reject" | "suspend",
  targetStatus: ApprovalStatus,
  validate: (s: ApprovalStatus) => boolean,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const requestId = (req as Request & { requestId?: string }).requestId;
    const auth = getAuth(req);
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid id", requestId }));
    }
    let reason: string | undefined;
    if (action !== "approve") {
      const body = reasonSchema.safeParse(req.body);
      if (!body.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "reason required", requestId }));
      }
      reason = body.data.reason;
    }
    try {
      const entity = appContext.entities.findHouseholdById(id.data);
      if (!entity) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Household not found", requestId }));
      }
      const scope = assertCoopEntityScope(auth, entity.cooperative_id);
      if (!scope.ok) {
        return next(new ApiError({ statusCode: 403, code: "forbidden", message: scope.message, requestId }));
      }
      if (!validate(entity.status)) {
        return next(
          new ApiError({
            statusCode: 409,
            code: "invalid_status_transition",
            message: `Cannot ${action} from status ${entity.status}`,
            requestId,
          }),
        );
      }
      const updated = await householdsRepo.updateHouseholdStatus(id.data, targetStatus as Parameters<typeof householdsRepo.updateHouseholdStatus>[1]);
      if (!updated) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Household not found", requestId }));
      }
      const after: Household = { ...entity, status: targetStatus };
      await appContext.entities.updateHouseholdInCache(after);
      await recordKycAudit({
        entity_type: "household",
        entity_id: id.data,
        before: entity,
        after,
        performed_by_user_id: auth.user.id,
        reason,
      });
      if (action === "approve") {
        await publishEvent(
          "kyc.household_approved",
          { household_id: id.data, cooperative_id: after.cooperative_id },
          { published_by: auth.user.id },
        );
      }
      return res.json(success({ household: after }, requestId));
    } catch (e) {
      next(e);
    }
  };
}

router.post(
  "/coop/households/:id/approve",
  requireAuth,
  requireKycReview(),
  requireCooperativeScope(),
  requireActiveCooperative(),
  async (req, res, next) => {
    const requestId = (req as Request & { requestId?: string }).requestId;
    const auth = getAuth(req);
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid id", requestId }));
    }
    try {
      const entity = appContext.entities.findHouseholdById(id.data);
      if (!entity) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Household not found", requestId }));
      }
      if (entity.cooperative_id == null) {
        return next(
          new ApiError({ statusCode: 409, code: "invalid_request", message: "Household has no cooperative", requestId }),
        );
      }
      const scope = assertCoopEntityScope(auth, entity.cooperative_id);
      if (!scope.ok) {
        return next(new ApiError({ statusCode: 403, code: "forbidden", message: scope.message, requestId }));
      }
      if (!canApproveFrom(entity.status)) {
        return next(
          new ApiError({
            statusCode: 409,
            code: "invalid_status_transition",
            message: `Cannot approve from status ${entity.status}`,
            requestId,
          }),
        );
      }

      const coopRow = await prisma.cooperatives.findUnique({
        where: { id: toBig(entity.cooperative_id) },
        select: { settings_json: true },
      });
      const quorum = getHouseholdApprovalQuorum(coopRow?.settings_json);
      const role = normalizeRole(auth.user.role);

      try {
        await householdApprovalsRepo.insertHouseholdApproval({
          household_id: id.data,
          approver_user_id: auth.user.id,
          role,
        });
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === "P2002") {
          return next(
            new ApiError({
              statusCode: 409,
              code: "duplicate_approver",
              message: "This user has already approved this household",
              requestId,
            }),
          );
        }
        throw e;
      }

      await recordHouseholdApprovalAudit({
        household_id: id.data,
        approver_user_id: auth.user.id,
        role,
        status: entity.status,
      });

      const approvalCount = await householdApprovalsRepo.countHouseholdApprovals(id.data);
      if (approvalCount < quorum) {
        return res.status(202).json(
          success(
            {
              pending: true,
              approvals: approvalCount,
              quorum,
              household: entity,
            },
            requestId,
          ),
        );
      }

      const updated = await householdsRepo.updateHouseholdStatus(id.data, "APPROVED");
      if (!updated) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Household not found", requestId }));
      }
      await prisma.$transaction(async (tx) => {
        await walletsRepo.findOrCreateHouseholdWallet(id.data, tx);
      });
      const after: Household = { ...entity, status: "APPROVED" };
      await appContext.entities.updateHouseholdInCache(after);
      await recordKycAudit({
        entity_type: "household",
        entity_id: id.data,
        before: entity,
        after,
        performed_by_user_id: auth.user.id,
      });
      await publishEvent(
        "kyc.household_approved",
        { household_id: id.data, cooperative_id: after.cooperative_id },
        { published_by: auth.user.id },
      );
      return res.json(success({ household: after, approvals: approvalCount, quorum }, requestId));
    } catch (e) {
      next(e);
    }
  },
);
router.post(
  "/coop/households/:id/reject",
  requireAuth,
  requireKycReview(),
  requireCooperativeScope(),
  requireActiveCooperative(),
  householdAction("reject", "REJECTED", canRejectFrom),
);
router.post(
  "/coop/households/:id/suspend",
  requireAuth,
  requireKycReview(),
  requireCooperativeScope(),
  requireActiveCooperative(),
  householdAction("suspend", "SUSPENDED", canSuspendFrom),
);

// --- Drivers ---
const driverRequestSchema = z.object({
  cooperative_id: z.number().int().positive(),
  full_name: persianNameSchema,
  license_number: z.string().min(2),
  license_file_url: z.string().url(),
  identity_file_url: z.string().url(),
});

router.post("/coop/drivers/request", requireAuth, async (req, res, next) => {
  const requestId = (req as Request & { requestId?: string }).requestId;
  const auth = getAuth(req);
  if (normalizeRole(auth.user.role) !== "DRIVER") {
    return next(new ApiError({ statusCode: 403, code: "forbidden", message: "DRIVER role required", requestId }));
  }
  const body = driverRequestSchema.safeParse(req.body);
  if (!body.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
  }
  try {
    const before = appContext.entities.findDriverByUserId(auth.user.id);
    const row = await appContext.entities.upsertDriver({
      user_id: auth.user.id,
      cooperative_id: body.data.cooperative_id,
      full_name: body.data.full_name,
      license_number: body.data.license_number,
      license_file_url: body.data.license_file_url,
      identity_file_url: body.data.identity_file_url,
      status: "PENDING",
    });
    await recordKycAudit({
      entity_type: "driver",
      entity_id: row.id,
      before: before ?? null,
      after: row,
      performed_by_user_id: auth.user.id,
    });
    return res.status(201).json(success({ driver: row }, requestId));
  } catch (e) {
    next(e);
  }
});

function driverAction(
  action: "approve" | "reject" | "suspend",
  targetStatus: ApprovalStatus,
  validate: (s: ApprovalStatus) => boolean,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const requestId = (req as Request & { requestId?: string }).requestId;
    const auth = getAuth(req);
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid id", requestId }));
    }
    let reason: string | undefined;
    if (action !== "approve") {
      const body = reasonSchema.safeParse(req.body);
      if (!body.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "reason required", requestId }));
      }
      reason = body.data.reason;
    }
    try {
      const entity = appContext.entities.findDriverById(id.data);
      if (!entity) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Driver not found", requestId }));
      }
      const scope = assertCoopEntityScope(auth, entity.cooperative_id);
      if (!scope.ok) {
        return next(new ApiError({ statusCode: 403, code: "forbidden", message: scope.message, requestId }));
      }
      if (!validate(entity.status)) {
        return next(
          new ApiError({
            statusCode: 409,
            code: "invalid_status_transition",
            message: `Cannot ${action} from status ${entity.status}`,
            requestId,
          }),
        );
      }
      const updated = await driversRepo.updateDriverStatus(id.data, targetStatus);
      if (!updated) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Driver not found", requestId }));
      }
      const after: Driver = { ...entity, status: targetStatus };
      await appContext.entities.updateDriverInCache(after);
      await recordKycAudit({
        entity_type: "driver",
        entity_id: id.data,
        before: entity,
        after,
        performed_by_user_id: auth.user.id,
        reason,
      });
      if (action === "approve") {
        await publishEvent(
          "kyc.driver_approved",
          { driver_id: id.data, cooperative_id: after.cooperative_id },
          { published_by: auth.user.id },
        );
      }
      return res.json(success({ driver: after }, requestId));
    } catch (e) {
      next(e);
    }
  };
}

router.post(
  "/coop/drivers/:id/approve",
  requireAuth,
  requireKycReview(),
  requireCooperativeScope(),
  requireActiveCooperative(),
  driverAction("approve", "APPROVED", canApproveFrom),
);
router.post(
  "/coop/drivers/:id/reject",
  requireAuth,
  requireKycReview(),
  requireCooperativeScope(),
  requireActiveCooperative(),
  driverAction("reject", "REJECTED", canRejectFrom),
);
router.post(
  "/coop/drivers/:id/suspend",
  requireAuth,
  requireKycReview(),
  requireCooperativeScope(),
  requireActiveCooperative(),
  driverAction("suspend", "SUSPENDED", canSuspendFrom),
);

// --- Fleet owners ---
const fleetOwnerRequestSchema = z.object({
  cooperative_id: z.number().int().positive(),
  full_name: persianNameSchema,
  national_id: z.string().min(5),
  bank_iban: z.string().min(15).optional(),
  ownership_doc_url: z.string().url(),
  insurance_doc_url: z.string().url(),
});

router.post("/coop/fleet_owners/request", requireAuth, async (req, res, next) => {
  const requestId = (req as Request & { requestId?: string }).requestId;
  const auth = getAuth(req);
  if (normalizeRole(auth.user.role) !== "FLEET_OWNER") {
    return next(new ApiError({ statusCode: 403, code: "forbidden", message: "FLEET_OWNER role required", requestId }));
  }
  const body = fleetOwnerRequestSchema.safeParse(req.body);
  if (!body.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
  }
  try {
    const before = appContext.entities.findFleetOwnerByUserId(auth.user.id);
    const nationalId = await assertNationalIdAvailable(
      "fleet_owner",
      before?.id ?? null,
      body.data.national_id,
      prisma,
      requestId,
    );
    const row = await appContext.entities.upsertFleetOwner({
      user_id: auth.user.id,
      cooperative_id: body.data.cooperative_id,
      full_name: body.data.full_name,
      national_id: nationalId,
      bank_iban: body.data.bank_iban,
      ownership_doc_url: body.data.ownership_doc_url,
      insurance_doc_url: body.data.insurance_doc_url,
      status: "PENDING",
    });
    await recordKycAudit({
      entity_type: "fleet_owner",
      entity_id: row.id,
      before: before ?? null,
      after: row,
      performed_by_user_id: auth.user.id,
    });
    return res.status(201).json(success({ fleet_owner: row }, requestId));
  } catch (e) {
    next(e);
  }
});

function fleetOwnerAction(
  action: "approve" | "reject" | "suspend",
  targetStatus: ApprovalStatus,
  validate: (s: ApprovalStatus) => boolean,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const requestId = (req as Request & { requestId?: string }).requestId;
    const auth = getAuth(req);
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid id", requestId }));
    }
    let reason: string | undefined;
    if (action !== "approve") {
      const body = reasonSchema.safeParse(req.body);
      if (!body.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "reason required", requestId }));
      }
      reason = body.data.reason;
    }
    try {
      const entity = appContext.entities.findFleetOwnerById(id.data);
      if (!entity) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Fleet owner not found", requestId }));
      }
      const scope = assertCoopEntityScope(auth, entity.cooperative_id);
      if (!scope.ok) {
        return next(new ApiError({ statusCode: 403, code: "forbidden", message: scope.message, requestId }));
      }
      if (!validate(entity.status)) {
        return next(
          new ApiError({
            statusCode: 409,
            code: "invalid_status_transition",
            message: `Cannot ${action} from status ${entity.status}`,
            requestId,
          }),
        );
      }
      const updated = await fleetOwnersRepo.updateFleetOwnerStatus(id.data, targetStatus);
      if (!updated) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Fleet owner not found", requestId }));
      }
      const after: FleetOwner = { ...entity, status: targetStatus };
      await appContext.entities.updateFleetOwnerInCache(after);
      await recordKycAudit({
        entity_type: "fleet_owner",
        entity_id: id.data,
        before: entity,
        after,
        performed_by_user_id: auth.user.id,
        reason,
      });
      return res.json(success({ fleet_owner: after }, requestId));
    } catch (e) {
      next(e);
    }
  };
}

router.post(
  "/coop/fleet_owners/:id/approve",
  requireAuth,
  requireKycReview(),
  requireCooperativeScope(),
  requireActiveCooperative(),
  fleetOwnerAction("approve", "APPROVED", canApproveFrom),
);
router.post(
  "/coop/fleet_owners/:id/reject",
  requireAuth,
  requireKycReview(),
  requireCooperativeScope(),
  requireActiveCooperative(),
  fleetOwnerAction("reject", "REJECTED", canRejectFrom),
);
router.post(
  "/coop/fleet_owners/:id/suspend",
  requireAuth,
  requireKycReview(),
  requireCooperativeScope(),
  requireActiveCooperative(),
  fleetOwnerAction("suspend", "SUSPENDED", canSuspendFrom),
);

// --- Vehicles ---
const vehicleRequestSchema = z.object({
  cooperative_id: z.number().int().positive(),
  license_plate: z.string().min(3),
  vehicle_type: z.string().min(2),
  capacity_tons: z.number().positive(),
  ownership_doc_url: z.string().url(),
  insurance_doc_url: z.string().url(),
});

router.post("/coop/vehicles/request", requireAuth, async (req, res, next) => {
  const requestId = (req as Request & { requestId?: string }).requestId;
  const auth = getAuth(req);
  if (normalizeRole(auth.user.role) !== "FLEET_OWNER") {
    return next(new ApiError({ statusCode: 403, code: "forbidden", message: "FLEET_OWNER role required", requestId }));
  }
  const body = vehicleRequestSchema.safeParse(req.body);
  if (!body.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
  }
  try {
    const owner = appContext.entities.findFleetOwnerByUserId(auth.user.id);
    if (!owner) {
      return next(new ApiError({ statusCode: 400, code: "fleet_owner_required", message: "Register fleet owner first", requestId }));
    }
    const existingRows = await vehiclesRepo.listVehiclesByOwner(owner.id);
    const before = existingRows.find((v) => v.license_plate === body.data.license_plate) ?? null;

    const row = await appContext.entities.upsertVehicle({
      owner_id: owner.id,
      cooperative_id: body.data.cooperative_id,
      license_plate: body.data.license_plate,
      vehicle_type: body.data.vehicle_type,
      capacity_tons: body.data.capacity_tons,
      ownership_doc_url: body.data.ownership_doc_url,
      insurance_doc_url: body.data.insurance_doc_url,
      status: "PENDING",
    });
    await recordKycAudit({
      entity_type: "vehicle",
      entity_id: row.id,
      before,
      after: row,
      performed_by_user_id: auth.user.id,
    });
    return res.status(201).json(success({ vehicle: row }, requestId));
  } catch (e) {
    next(e);
  }
});

function vehicleAction(
  action: "approve" | "reject" | "suspend",
  targetStatus: ApprovalStatus,
  validate: (s: ApprovalStatus) => boolean,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const requestId = (req as Request & { requestId?: string }).requestId;
    const auth = getAuth(req);
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid id", requestId }));
    }
    let reason: string | undefined;
    if (action !== "approve") {
      const body = reasonSchema.safeParse(req.body);
      if (!body.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "reason required", requestId }));
      }
      reason = body.data.reason;
    }
    try {
      const entity = appContext.entities.findVehicleById(id.data);
      if (!entity) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Vehicle not found", requestId }));
      }
      const scope = assertCoopEntityScope(auth, entity.cooperative_id);
      if (!scope.ok) {
        return next(new ApiError({ statusCode: 403, code: "forbidden", message: scope.message, requestId }));
      }
      if (!validate(entity.status)) {
        return next(
          new ApiError({
            statusCode: 409,
            code: "invalid_status_transition",
            message: `Cannot ${action} from status ${entity.status}`,
            requestId,
          }),
        );
      }
      const updated = await vehiclesRepo.updateVehicleStatus(id.data, targetStatus);
      if (!updated) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Vehicle not found", requestId }));
      }
      const after: Vehicle = { ...entity, status: targetStatus };
      await appContext.entities.updateVehicleInCache(after);
      await recordKycAudit({
        entity_type: "vehicle",
        entity_id: id.data,
        before: entity,
        after,
        performed_by_user_id: auth.user.id,
        reason,
      });
      return res.json(success({ vehicle: after }, requestId));
    } catch (e) {
      next(e);
    }
  };
}

router.post(
  "/coop/vehicles/:id/approve",
  requireAuth,
  requireKycReview(),
  requireCooperativeScope(),
  requireActiveCooperative(),
  vehicleAction("approve", "APPROVED", canApproveFrom),
);
router.post(
  "/coop/vehicles/:id/reject",
  requireAuth,
  requireKycReview(),
  requireCooperativeScope(),
  requireActiveCooperative(),
  vehicleAction("reject", "REJECTED", canRejectFrom),
);
router.post(
  "/coop/vehicles/:id/suspend",
  requireAuth,
  requireKycReview(),
  requireCooperativeScope(),
  requireActiveCooperative(),
  vehicleAction("suspend", "SUSPENDED", canSuspendFrom),
);

// --- NEEDS_CORRECTION workflow (KYC-NC-1) ---

const householdResubmitSchema = z
  .object({
    head_name: persianNameSchema.optional(),
  })
  .strict()
  .refine((d) => d.head_name != null, { message: "At least one field required" });

const bankAccountBodySchema = z.object({
  bank_iban: z.string().min(15),
  reason: z.string().min(3).optional(),
});

const driverResubmitSchema = z
  .object({
    full_name: persianNameSchema.optional(),
    license_number: z.string().min(2).optional(),
    license_file_url: z.string().url().optional(),
    identity_file_url: z.string().url().optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.full_name != null ||
      d.license_number != null ||
      d.license_file_url != null ||
      d.identity_file_url != null,
    { message: "At least one field required" },
  );

const fleetOwnerResubmitSchema = z
  .object({
    full_name: persianNameSchema.optional(),
    ownership_doc_url: z.string().url().optional(),
    insurance_doc_url: z.string().url().optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.full_name != null ||
      d.ownership_doc_url != null ||
      d.insurance_doc_url != null,
    { message: "At least one field required" },
  );

const vehicleResubmitSchema = z
  .object({
    ownership_doc_url: z.string().url().optional(),
    insurance_doc_url: z.string().url().optional(),
    license_plate: z.string().min(3).optional(),
    vehicle_type: z.string().min(2).optional(),
    capacity_tons: z.number().positive().optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.ownership_doc_url != null ||
      d.insurance_doc_url != null ||
      d.license_plate != null ||
      d.vehicle_type != null ||
      d.capacity_tons != null,
    { message: "At least one field required" },
  );

function requestCorrectionRoute<E extends { id: number; cooperative_id?: number; status: ApprovalStatus }>(
  entityType: KycEntityKind,
  findEntity: (id: number) => E | null | undefined,
  updateStatus: (id: number) => Promise<unknown>,
  updateCache: (after: E) => Promise<unknown>,
  responseKey: string,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const requestId = (req as Request & { requestId?: string }).requestId;
    const auth = getAuth(req);
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid id", requestId }));
    }
    const body = correctionReasonSchema.safeParse(req.body);
    if (!body.success) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "invalid_request",
          message: "reason required (min 10 characters)",
          requestId,
        }),
      );
    }
    try {
      const entity = findEntity(id.data);
      if (!entity) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Not found", requestId }));
      }
      const scope = assertCoopEntityScope(auth, entity.cooperative_id);
      if (!scope.ok) {
        return next(new ApiError({ statusCode: 403, code: "forbidden", message: scope.message, requestId }));
      }
      if (!canRequestCorrectionFrom(entity.status)) {
        return next(
          new ApiError({
            statusCode: 409,
            code: "invalid_status_transition",
            message: `Cannot request correction from status ${entity.status}`,
            requestId,
          }),
        );
      }
      const fromStatus = entity.status;
      const updated = await updateStatus(id.data);
      if (!updated) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Not found", requestId }));
      }
      const after = { ...entity, status: "NEEDS_CORRECTION" as ApprovalStatus } as E;
      await updateCache(after);
      await recordKycAudit({
        entity_type: entityType,
        entity_id: id.data,
        before: { entity: entityType, status: fromStatus },
        after: { entity: entityType, status: "NEEDS_CORRECTION" },
        performed_by_user_id: auth.user.id,
        reason: body.data.reason,
      });
      return res.json(success({ [responseKey]: after }, requestId));
    } catch (e) {
      next(e);
    }
  };
}

function resubmitRoute<
  T extends { id: number; cooperative_id?: number; status: ApprovalStatus; user_id?: number; owner_id?: number },
>(
  entityType: KycEntityKind,
  findEntity: (id: number) => T | null | undefined,
  parseBody: (body: unknown) => { success: true; data: Record<string, unknown> } | { success: false },
  patchEntity: (id: number, fields: Record<string, unknown>) => Promise<T | null>,
  updateCache: (row: T) => Promise<unknown>,
  responseKey: string,
  resubmitAuth: (auth: AuthContext, entity: T) => { ok: true } | { ok: false; message: string },
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const requestId = (req as Request & { requestId?: string }).requestId;
    const auth = getAuth(req);
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid id", requestId }));
    }
    if (req.body && typeof req.body === "object" && "bank_iban" in req.body) {
      const path =
        entityType === "household"
          ? `/coop/households/${id.data}/bank-account`
          : entityType === "fleet_owner"
            ? `/coop/fleet_owners/${id.data}/bank-account`
            : null;
      return next(
        new ApiError({
          statusCode: 400,
          code: "iban_use_dedicated_endpoint",
          message: path
            ? `Use POST /api${path} to update bank_iban`
            : "bank_iban cannot be changed via resubmit",
          requestId,
        }),
      );
    }
    const body = parseBody(req.body);
    if (!body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
    }
    if ("national_id" in body.data) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "national_id cannot be changed", requestId }));
    }
    try {
      const entity = findEntity(id.data);
      if (!entity) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Not found", requestId }));
      }
      const access = resubmitAuth(auth, entity);
      if (!access.ok) {
        return next(new ApiError({ statusCode: 403, code: "forbidden", message: access.message, requestId }));
      }
      if (!canResubmitFrom(entity.status)) {
        return next(
          new ApiError({
            statusCode: 409,
            code: "invalid_status_transition",
            message: `Cannot resubmit from status ${entity.status}`,
            requestId,
          }),
        );
      }
      const patched = await patchEntity(id.data, body.data);
      if (!patched) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Not found", requestId }));
      }
      const after = { ...entity, ...patched, status: "PENDING" as ApprovalStatus };
      await updateCache(after as T);
      await recordKycResubmitAudit({
        entity_type: entityType,
        entity_id: id.data,
        before: entity,
        after,
        performed_by_user_id: auth.user.id,
      });
      return res.json(success({ [responseKey]: after }, requestId));
    } catch (e) {
      next(e);
    }
  };
}

const correctionMiddleware = [
  requireAuth,
  requireCoopKycStaff(),
  requireCooperativeScope(),
  requireActiveCooperative(),
] as const;

router.post(
  "/coop/households/:id/request-correction",
  ...correctionMiddleware,
  requestCorrectionRoute(
    "household",
    (id) => appContext.entities.findHouseholdById(id) ?? undefined,
    (id) => householdsRepo.updateHouseholdStatus(id, "NEEDS_CORRECTION"),
    (after) => appContext.entities.updateHouseholdInCache(after),
    "household",
  ),
);
router.post(
  "/coop/drivers/:id/request-correction",
  ...correctionMiddleware,
  requestCorrectionRoute(
    "driver",
    (id) => appContext.entities.findDriverById(id) ?? undefined,
    (id) => driversRepo.updateDriverStatus(id, "NEEDS_CORRECTION"),
    (after) => appContext.entities.updateDriverInCache(after),
    "driver",
  ),
);
router.post(
  "/coop/fleet_owners/:id/request-correction",
  ...correctionMiddleware,
  requestCorrectionRoute(
    "fleet_owner",
    (id) => appContext.entities.findFleetOwnerById(id) ?? undefined,
    (id) => fleetOwnersRepo.updateFleetOwnerStatus(id, "NEEDS_CORRECTION"),
    (after) => appContext.entities.updateFleetOwnerInCache(after),
    "fleet_owner",
  ),
);
router.post(
  "/coop/vehicles/:id/request-correction",
  ...correctionMiddleware,
  requestCorrectionRoute(
    "vehicle",
    (id) => appContext.entities.findVehicleById(id) ?? undefined,
    (id) => vehiclesRepo.updateVehicleStatus(id, "NEEDS_CORRECTION"),
    (after) => appContext.entities.updateVehicleInCache(after),
    "vehicle",
  ),
);

router.post(
  "/coop/households/:id/resubmit",
  requireAuth,
  resubmitRoute(
    "household",
    (id) => appContext.entities.findHouseholdById(id) ?? undefined,
    (body) => {
      const p = householdResubmitSchema.safeParse(body);
      return p.success ? { success: true as const, data: p.data } : { success: false as const };
    },
    (id, fields) => householdsRepo.patchHouseholdKycFields(id, fields as { head_name?: string }),
    (row) => appContext.entities.updateHouseholdInCache(row as Household),
    "household",
    (auth, entity) => assertCanResubmit(auth, entity, { applicantUserId: entity.user_id }),
  ),
);
router.post(
  "/coop/drivers/:id/resubmit",
  requireAuth,
  resubmitRoute(
    "driver",
    (id) => appContext.entities.findDriverById(id) ?? undefined,
    (body) => {
      const p = driverResubmitSchema.safeParse(body);
      return p.success ? { success: true as const, data: p.data } : { success: false as const };
    },
    (id, fields) =>
      driversRepo.patchDriverKycFields(
        id,
        fields as {
          full_name?: string;
          license_number?: string;
          license_file_url?: string;
          identity_file_url?: string;
        },
      ),
    (row) => appContext.entities.updateDriverInCache(row as Driver),
    "driver",
    (auth, entity) => assertCanResubmit(auth, entity, { applicantUserId: entity.user_id }),
  ),
);
router.post(
  "/coop/fleet_owners/:id/resubmit",
  requireAuth,
  resubmitRoute(
    "fleet_owner",
    (id) => appContext.entities.findFleetOwnerById(id) ?? undefined,
    (body) => {
      const p = fleetOwnerResubmitSchema.safeParse(body);
      return p.success ? { success: true as const, data: p.data } : { success: false as const };
    },
    (id, fields) =>
      fleetOwnersRepo.patchFleetOwnerKycFields(
        id,
        fields as {
          full_name?: string;
          ownership_doc_url?: string;
          insurance_doc_url?: string;
        },
      ),
    (row) => appContext.entities.updateFleetOwnerInCache(row as FleetOwner),
    "fleet_owner",
    (auth, entity) => assertCanResubmit(auth, entity, { applicantUserId: entity.user_id }),
  ),
);
router.post(
  "/coop/vehicles/:id/resubmit",
  requireAuth,
  resubmitRoute(
    "vehicle",
    (id) => appContext.entities.findVehicleById(id) ?? undefined,
    (body) => {
      const p = vehicleResubmitSchema.safeParse(body);
      return p.success ? { success: true as const, data: p.data } : { success: false as const };
    },
    (id, fields) =>
      vehiclesRepo.patchVehicleKycFields(
        id,
        fields as {
          ownership_doc_url?: string;
          insurance_doc_url?: string;
          license_plate?: string;
          vehicle_type?: string;
          capacity_tons?: number;
        },
      ),
    (row) => appContext.entities.updateVehicleInCache(row as Vehicle),
    "vehicle",
    (auth, entity) => {
      const ownerId = entity.owner_id;
      if (ownerId == null) {
        return { ok: false as const, message: "Vehicle has no owner" };
      }
      const owner = appContext.entities.findFleetOwnerById(ownerId);
      return assertCanResubmit(auth, entity, { vehicleOwnerUserId: owner?.user_id });
    },
  ),
);

function bankAccountRoute<
  T extends { id: number; cooperative_id?: number; bank_iban?: string; user_id?: number },
>(
  entityType: "household" | "fleet_owner",
  findEntity: (id: number) => T | null | undefined,
  updateIban: (id: number, iban: string) => Promise<T | null>,
  updateCache: (row: T) => Promise<unknown>,
  responseKey: string,
  assertAccess: (auth: AuthContext, entity: T) => { ok: true } | { ok: false; message: string },
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const requestId = (req as Request & { requestId?: string }).requestId;
    const auth = getAuth(req);
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid id", requestId }));
    }
    const body = bankAccountBodySchema.safeParse(req.body);
    if (!body.success) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "invalid_request",
          message: "bank_iban required",
          details: body.error.flatten(),
          requestId,
        }),
      );
    }
    try {
      const entity = findEntity(id.data);
      if (!entity) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Not found", requestId }));
      }
      const access = assertAccess(auth, entity);
      if (!access.ok) {
        return next(new ApiError({ statusCode: 403, code: "forbidden", message: access.message, requestId }));
      }
      let iban: string;
      try {
        iban = await assertIbanAvailable(entityType, body.data.bank_iban, id.data, prisma, requestId);
      } catch (e) {
        return next(e);
      }
      const updated = await updateIban(id.data, iban);
      if (!updated) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Not found", requestId }));
      }
      const after = { ...entity, ...updated, bank_iban: iban };
      await updateCache(after);
      await recordIbanAudit({
        entity_type: entityType,
        entity_id: id.data,
        before_iban: entity.bank_iban,
        after_iban: iban,
        performed_by_user_id: auth.user.id,
        reason: body.data.reason,
      });
      return res.json(success({ [responseKey]: after }, requestId));
    } catch (e) {
      next(e);
    }
  };
}

function assertCanChangeHouseholdBankAccount(
  auth: AuthContext,
  entity: Household,
): { ok: true } | { ok: false; message: string } {
  const role = normalizeRole(auth.user.role);
  if (role === "ADMIN") return { ok: true };
  if (isCoopKycStaff(auth.user.role)) {
    return assertCoopEntityScope(auth, entity.cooperative_id);
  }
  if (role === "HOUSEHOLD" && auth.user.id === entity.user_id) {
    return { ok: true };
  }
  return { ok: false, message: "Insufficient role to change bank account" };
}

function assertCanChangeFleetOwnerBankAccount(
  auth: AuthContext,
  entity: FleetOwner,
): { ok: true } | { ok: false; message: string } {
  const role = normalizeRole(auth.user.role);
  if (role === "ADMIN") return { ok: true };
  if (isCoopKycStaff(auth.user.role)) {
    return assertCoopEntityScope(auth, entity.cooperative_id);
  }
  if (role === "FLEET_OWNER" && auth.user.id === entity.user_id) {
    return { ok: true };
  }
  return { ok: false, message: "Insufficient role to change bank account" };
}

router.post(
  "/coop/households/:id/bank-account",
  requireAuth,
  bankAccountRoute(
    "household",
    (id) => appContext.entities.findHouseholdById(id) ?? undefined,
    (id, iban) => householdsRepo.updateHouseholdIban(id, iban),
    (row) => appContext.entities.updateHouseholdInCache(row as Household),
    "household",
    assertCanChangeHouseholdBankAccount,
  ),
);
router.post(
  "/coop/fleet_owners/:id/bank-account",
  requireAuth,
  bankAccountRoute(
    "fleet_owner",
    (id) => appContext.entities.findFleetOwnerById(id) ?? undefined,
    (id, iban) => fleetOwnersRepo.updateFleetOwnerIban(id, iban),
    (row) => appContext.entities.updateFleetOwnerInCache(row as FleetOwner),
    "fleet_owner",
    assertCanChangeFleetOwnerBankAccount,
  ),
);

export const coopKycRouter = router;
