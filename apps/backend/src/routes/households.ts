import { Router } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import { env } from "../config/env";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import { normalizeIban, validateIranIbanChecksum } from "../lib/iban";
import { recordIbanAudit } from "../lib/ibanAudit";
import { recordKycAudit } from "../lib/kycWorkflow";
import * as householdsRepo from "../repositories/householdsRepository";
import * as walletsRepo from "../repositories/walletsRepository";
import * as workspaceRepo from "../repositories/workspaceMembershipsRepository";
import { prisma } from "../db/prisma";
import { normalizeRole } from "../types/userRole";
import { assertNationalIdAvailable } from "../lib/nationalIdEnforcement";
import { normalizeNationalId, validateIranNationalIdChecksum } from "../lib/nationalId";
import {
  getHouseholdPoolStatus,
  getHouseholdShares,
  PERIOD_KEY_RE,
  resolveMineIdForHousehold,
} from "../lib/householdShares";
import { ruleEngine } from "../services/ruleEngine";

const router = Router();
const requireAuth = authMiddleware(resolveAuthContext);

const registerSchema = z.object({
  village_id: z.number().int().positive(),
  national_id: z.string().min(5).max(20),
  bank_iban: z.string().min(15),
  head_name: z.string().min(2),
});

const ibanPatchSchema = z.object({
  bank_iban: z.string().min(15),
  reason: z.string().min(3).optional(),
});

function getAuth(req: import("express").Request): AuthContext {
  return (req as import("express").Request & { auth: AuthContext }).auth;
}

function householdPayload(h: householdsRepo.HouseholdRow) {
  return {
    id: h.id,
    user_id: h.user_id,
    village_id: h.village_id,
    cooperative_id: h.cooperative_id,
    head_name: h.head_name,
    national_id: h.national_id,
    bank_iban: h.bank_iban,
    status: h.status,
    wallet_active: h.status === "APPROVED",
  };
}

async function resolveCooperativeId(auth: AuthContext): Promise<number | null> {
  const household = appContext.entities.findHouseholdByUserId(auth.user.id);
  if (household?.cooperative_id) return household.cooperative_id;

  if (auth.mineId) {
    const membership = await workspaceRepo.findActiveMembership({
      userId: auth.user.id,
      mineId: auth.mineId,
      cooperativeId: undefined,
    });
    if (membership?.cooperative_id) return membership.cooperative_id;
  }

  const memberships = await workspaceRepo.listActiveForUser(auth.user.id, auth.user.role);
  const community = memberships.find((w) => w.membership_kind === "COMMUNITY");
  if (community?.cooperative_id) return community.cooperative_id;

  const user = await appContext.userStore.getById(auth.user.id);
  return user?.cooperative_id ?? null;
}

function assertHouseholdRole(auth: AuthContext, requestId?: string) {
  if (normalizeRole(auth.user.role) !== "HOUSEHOLD") {
    throw new ApiError({
      statusCode: 403,
      code: "forbidden",
      message: "HOUSEHOLD role required",
      requestId,
    });
  }
}

function assertNationalIdMobileMatch(mobile: string, nationalId: string, requestId?: string) {
  const mobileDigits = mobile.replace(/\D/g, "");
  const nationalDigits = nationalId.replace(/\D/g, "");
  const mobileTail = mobileDigits.length >= 10 ? mobileDigits.slice(-10) : mobileDigits;
  if (nationalDigits !== mobileTail && nationalDigits !== mobileDigits) {
    throw new ApiError({
      statusCode: 400,
      code: "national_id_mobile_mismatch",
      message: "national_id does not match registered mobile number",
      requestId,
    });
  }
}

router.get("/households/me", requireAuth, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = getAuth(req);
  try {
    assertHouseholdRole(auth, requestId);
    const household = appContext.entities.findHouseholdByUserId(auth.user.id);
    if (!household) {
      return next(
        new ApiError({
          statusCode: 404,
          code: "household_not_found",
          message: "Household profile not found",
          requestId,
        }),
      );
    }
    return res.json(success({ household: householdPayload(household) }, requestId));
  } catch (e) {
    next(e);
  }
});

router.post("/households/register", requireAuth, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = getAuth(req);
  const body = registerSchema.safeParse(req.body);
  if (!body.success) {
    return next(
      new ApiError({
        statusCode: 400,
        code: "invalid_request",
        message: "Invalid body",
        details: body.error.flatten(),
        requestId,
      }),
    );
  }

  try {
    assertHouseholdRole(auth, requestId);

    const existing = appContext.entities.findHouseholdByUserId(auth.user.id);
    if (existing) {
      return next(
        new ApiError({
          statusCode: 409,
          code: "household_already_registered",
          message: "Household profile already exists",
          requestId,
        }),
      );
    }

    if (!auth.mineId) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "mine_not_selected",
          message: "Select mine workspace before registration",
          requestId,
        }),
      );
    }

    const cooperativeId = await resolveCooperativeId(auth);
    if (!cooperativeId) {
      return next(
        new ApiError({
          statusCode: 403,
          code: "forbidden",
          message: "No cooperative scope for this workspace",
          requestId,
        }),
      );
    }

    const villages = appContext.mineData.listVillagesByMine(auth.mineId);
    if (!villages.some((v) => v.id === body.data.village_id)) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "village_not_in_mine",
          message: "village_id is not in the selected mine",
          requestId,
        }),
      );
    }

    const iban = normalizeIban(body.data.bank_iban);
    if (!validateIranIbanChecksum(iban)) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "invalid_iban",
          message: "Invalid Iranian IBAN checksum",
          requestId,
        }),
      );
    }

    const normalizedNationalId = normalizeNationalId(body.data.national_id);
    if (!validateIranNationalIdChecksum(normalizedNationalId)) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "invalid_national_id",
          message: "Invalid Iranian national ID checksum",
          requestId,
        }),
      );
    }

    if (env.KYC_MATCH_MOBILE_NATIONAL_ID) {
      assertNationalIdMobileMatch(auth.user.mobile_number, normalizedNationalId, requestId);
    }

    const nationalId = await assertNationalIdAvailable(
      "household",
      null,
      normalizedNationalId,
      prisma,
      requestId,
    );

    const row = await appContext.entities.upsertHousehold({
      user_id: auth.user.id,
      village_id: body.data.village_id,
      cooperative_id: cooperativeId,
      head_name: body.data.head_name,
      national_id: nationalId,
      bank_iban: iban,
      status: "PENDING",
    });

    await prisma.$transaction(async (tx) => {
      await walletsRepo.findOrCreateHouseholdWallet(row.id, tx);
    });

    await recordKycAudit({
      entity_type: "household",
      entity_id: row.id,
      before: null,
      after: row,
      performed_by_user_id: auth.user.id,
    });

    return res.status(201).json(success({ household: householdPayload(row) }, requestId));
  } catch (e) {
    next(e);
  }
});

router.patch("/households/me", requireAuth, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = getAuth(req);
  try {
    assertHouseholdRole(auth, requestId);
    if (req.body && typeof req.body === "object" && "national_id" in req.body) {
      return next(
        new ApiError({
          statusCode: 403,
          code: "national_id_locked",
          message: "national_id cannot be changed",
          requestId,
        }),
      );
    }
    return next(
      new ApiError({
        statusCode: 400,
        code: "invalid_request",
        message: "Use PATCH /households/me/iban to update bank_iban",
        requestId,
      }),
    );
  } catch (e) {
    next(e);
  }
});

async function requireApprovedHousehold(auth: AuthContext, requestId?: string) {
  assertHouseholdRole(auth, requestId);
  const household = await householdsRepo.findHouseholdByUserId(auth.user.id);
  if (!household) {
    throw new ApiError({
      statusCode: 404,
      code: "household_not_found",
      message: "Household profile not found",
      requestId,
    });
  }
  return household;
}

async function resolvePeriodKey(
  raw: unknown,
  cooperativeId: number | undefined,
  villageId: number,
  requestId?: string,
): Promise<string> {
  if (raw != null && raw !== "") {
    const period = String(raw);
    if (!PERIOD_KEY_RE.test(period)) {
      throw new ApiError({
        statusCode: 400,
        code: "invalid_period",
        message: "period must be YYYY-MM",
        requestId,
      });
    }
    return period;
  }
  const mineId = await resolveMineIdForHousehold(cooperativeId, villageId);
  return ruleEngine.getPeriodKey(new Date(), {
    mineId: mineId ?? undefined,
    cooperativeId,
  });
}

router.get("/household/shares", requireAuth, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = getAuth(req);
  try {
    const household = await requireApprovedHousehold(auth, requestId);
    const periodKey = await resolvePeriodKey(req.query.period, household.cooperative_id, household.village_id, requestId);
    const payload = await getHouseholdShares({
      householdId: household.id,
      cooperativeId: household.cooperative_id,
      villageId: household.village_id,
      periodKey,
    });
    return res.json(success(payload, requestId));
  } catch (e) {
    next(e);
  }
});

router.get("/household/pool-status", requireAuth, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = getAuth(req);
  try {
    const household = await requireApprovedHousehold(auth, requestId);
    const periodKey = await resolvePeriodKey(req.query.period, household.cooperative_id, household.village_id, requestId);
    const payload = await getHouseholdPoolStatus({
      cooperativeId: household.cooperative_id,
      villageId: household.village_id,
      periodKey,
    });
    return res.json(success(payload, requestId));
  } catch (e) {
    next(e);
  }
});

router.patch("/households/me/iban", requireAuth, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = getAuth(req);
  const body = ibanPatchSchema.safeParse(req.body);
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
    assertHouseholdRole(auth, requestId);

    if (req.body && typeof req.body === "object" && "national_id" in req.body) {
      return next(
        new ApiError({
          statusCode: 403,
          code: "national_id_locked",
          message: "national_id cannot be changed",
          requestId,
        }),
      );
    }

    const before = appContext.entities.findHouseholdByUserId(auth.user.id);
    if (!before) {
      return next(
        new ApiError({
          statusCode: 404,
          code: "household_not_found",
          message: "Household profile not found",
          requestId,
        }),
      );
    }

    const iban = normalizeIban(body.data.bank_iban);
    if (!validateIranIbanChecksum(iban)) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "invalid_iban",
          message: "Invalid Iranian IBAN checksum",
          requestId,
        }),
      );
    }

    const updated = await householdsRepo.updateHouseholdIban(before.id, iban);
    if (!updated) {
      return next(
        new ApiError({
          statusCode: 404,
          code: "household_not_found",
          message: "Household profile not found",
          requestId,
        }),
      );
    }

    const after = { ...before, bank_iban: iban };
    await appContext.entities.updateHouseholdInCache(after);

    await recordIbanAudit({
      entity_type: "household",
      entity_id: before.id,
      before_iban: before.bank_iban,
      after_iban: iban,
      performed_by_user_id: auth.user.id,
      reason: body.data.reason,
    });

    return res.json(success({ household: householdPayload(after) }, requestId));
  } catch (e) {
    next(e);
  }
});

export const householdsRouter = router;
