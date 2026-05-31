import { Router } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import { env } from "../config/env";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requireAnyPermission, requirePermission, requireRoles } from "../middleware/rbac";
import {
  filterHouseholdsByScope,
  requireActiveCooperative,
  requireCooperativeScope,
} from "../middleware/scope";
import { requireMineContext } from "../middleware/requireMineContext";
import { assertCooperativeMineScope } from "../lib/mineScope";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import * as cooperativesRepo from "../repositories/cooperativesRepository";
import * as householdsRepo from "../repositories/householdsRepository";
import * as usersRepo from "../repositories/usersRepository";
import * as walletsRepo from "../repositories/walletsRepository";
import { prisma } from "../db/prisma";
import {
  defaultImportStatus,
  parseHouseholdImportCsv,
  placeholderMobileForNationalId,
  toPreviewRows,
  validateParsedRow,
  type BulkImportParsedRow,
  type BulkImportRowError,
} from "../lib/householdBulkImport";
import type { MembershipObjection } from "../stores/entitiesStore";
import { normalizeRole } from "../types/userRole";
import { assertNationalIdAvailable } from "../lib/nationalIdEnforcement";

const router = Router();

const requireAuth = authMiddleware(resolveAuthContext);
const requireCoopMine = [requireMineContext()] as const;

async function assertCoopSessionMine(auth: AuthContext, requestId?: string): Promise<void> {
  const coopId = auth.scope?.cooperativeId;
  if (!coopId) return;
  const cooperative = await cooperativesRepo.findCooperativeById(coopId);
  if (!cooperative) return;
  assertCooperativeMineScope(auth, cooperative.mine_id, requestId);
}

async function objectionDto(obj: MembershipObjection) {
  const reporter = await usersRepo.findUserById(obj.reporter_user_id);
  return {
    id: obj.id,
    cooperative_id: obj.cooperative_id,
    household_id: obj.household_id,
    reporter_user_id: obj.reporter_user_id,
    reporter_mobile: reporter?.mobile_number,
    reason: obj.reason,
    status: obj.status,
    resolved_by: obj.resolved_by,
    resolution_reason: obj.resolution_reason,
    created_at: obj.created_at,
  };
}

router.get(
  "/coop/me",
  requireAuth,
  requirePermission("members:read"),
  requireCooperativeScope(),
  async (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;
    try {
      const coopId = auth.scope?.cooperativeId;
      const cooperative = coopId ? await cooperativesRepo.findCooperativeById(coopId) : null;
      return res.json(
        success(
          {
            cooperative_id: coopId ?? null,
            role: auth.user.role,
            effective_role: normalizeRole(auth.user.role),
            cooperative: cooperative ?? null,
          },
          requestId,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/coop/members",
  requireAuth,
  ...requireCoopMine,
  requirePermission("members:read"),
  requireCooperativeScope(),
  requireActiveCooperative(),
  async (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;
    try {
      await assertCoopSessionMine(auth, requestId);
      const households = filterHouseholdsByScope(appContext.entities.listHouseholds(), auth);
      return res.json(
        success(
          {
            members: households.map((h) => ({
              household_id: h.id,
              head_name: h.head_name,
              village_id: h.village_id,
              cooperative_id: h.cooperative_id,
              status: h.status,
            })),
          },
          requestId,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/coop/objections",
  requireAuth,
  ...requireCoopMine,
  requirePermission("coop:manage"),
  requireCooperativeScope(),
  requireActiveCooperative(),
  async (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;
    try {
      await assertCoopSessionMine(auth, requestId);
      const coopId = auth.scope?.cooperativeId;
      const objections = await appContext.entities.listObjections(
        coopId != null ? { cooperative_id: coopId } : undefined,
      );
      const dtos = await Promise.all(objections.map((o) => objectionDto(o)));
      return res.json(success({ objections: dtos }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

const importBodySchema = z.object({
  csv: z.string().min(1).optional(),
  rows: z
    .array(
      z.object({
        national_id: z.string().min(1),
        full_name: z.string().min(1),
        village_id: z.number().int().positive().optional(),
        village_code: z.string().min(1).optional(),
        mobile: z.string().optional(),
      }),
    )
    .optional(),
  dry_run: z.boolean().optional(),
});

function getAuth(req: import("express").Request): AuthContext {
  return (req as import("express").Request & { auth: AuthContext }).auth;
}

function resolveVillageForImport(
  row: BulkImportParsedRow,
  villageById: Map<number, { id: number }>,
  villageByCode: Map<string, { id: number }>,
): { village_id?: number; error?: string } {
  if (row.village_id != null) {
    const v = villageById.get(row.village_id);
    if (!v) return { error: `village_id ${row.village_id} not in cooperative mine` };
    return { village_id: v.id };
  }
  if (row.village_code) {
    const code = row.village_code.trim();
    const asNum = Number(code);
    if (Number.isFinite(asNum) && asNum > 0) {
      const v = villageById.get(asNum);
      if (v) return { village_id: v.id };
    }
    const v = villageByCode.get(code.toLowerCase());
    if (!v) return { error: `village_code "${row.village_code}" not found` };
    return { village_id: v.id };
  }
  return { error: "village_id or village_code required" };
}

router.post(
  "/coop/households/import",
  requireAuth,
  ...requireCoopMine,
  requireAnyPermission("coop:manage", "kyc:approve"),
  requireCooperativeScope(),
  requireActiveCooperative(),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    const auth = getAuth(req);
    const body = importBodySchema.safeParse(req.body);
    if (!body.success) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "invalid_request",
          message: "Provide csv string or rows array",
          requestId,
        }),
      );
    }

    try {
      await assertCoopSessionMine(auth, requestId);
      const coopId = auth.scope?.cooperativeId;
      if (!coopId) {
        return next(
          new ApiError({ statusCode: 403, code: "forbidden", message: "No cooperative scope", requestId }),
        );
      }

      const cooperative = await cooperativesRepo.findCooperativeById(coopId);
      if (!cooperative) {
        return next(
          new ApiError({ statusCode: 404, code: "cooperative_not_found", message: "Cooperative not found", requestId }),
        );
      }

      const mineVillages = appContext.mineData.listVillagesByMine(cooperative.mine_id);
      const villageById = new Map(mineVillages.map((v) => [v.id, v]));
      const villageByCode = new Map(
        mineVillages.map((v) => [String(v.id), v]),
      );
      for (const v of mineVillages) {
        villageByCode.set(v.name.trim().toLowerCase(), v);
        if (v.district) villageByCode.set(v.district.trim().toLowerCase(), v);
      }

      const resolveVillage = (row: BulkImportParsedRow) =>
        resolveVillageForImport(row, villageById, villageByCode);

      let parsedRows: BulkImportParsedRow[] = [];
      const headerErrors: BulkImportRowError[] = [];

      if (body.data.csv) {
        const parsed = parseHouseholdImportCsv(body.data.csv);
        headerErrors.push(...parsed.errors);
        parsedRows = parsed.rows;
      } else if (body.data.rows?.length) {
        parsedRows = body.data.rows.map((r, i) => ({
          line: i + 2,
          national_id: r.national_id,
          full_name: r.full_name,
          village_id: r.village_id,
          village_code: r.village_code,
          mobile: r.mobile,
        }));
      } else {
        return next(
          new ApiError({
            statusCode: 400,
            code: "invalid_request",
            message: "csv or rows required",
            requestId,
          }),
        );
      }

      const dryRun = body.data.dry_run === true;

      if (headerErrors.length > 0 && parsedRows.length === 0) {
        return res.json(
          success({ imported: 0, skipped: 0, errors: headerErrors, dry_run: dryRun }, requestId),
        );
      }

      if (dryRun) {
        const preview = toPreviewRows(parsedRows, { resolveVillage });
        const invalid = preview.filter((r) => !r.valid).length;
        return res.json(
          success(
            {
              imported: preview.length - invalid,
              skipped: invalid,
              errors: preview
                .filter((r) => !r.valid)
                .flatMap((r) =>
                  r.errors.map((msg) => ({
                    line: r.line,
                    national_id: r.national_id,
                    code: "validation_error",
                    message: msg,
                  })),
                ),
              dry_run: true,
              rows: preview,
            },
            requestId,
          ),
        );
      }

      const seenNationalIds = new Set<string>();
      const errors: BulkImportRowError[] = [...headerErrors];
      let imported = 0;
      let skipped = 0;
      const status = defaultImportStatus();

      for (const row of parsedRows) {
        const validated = validateParsedRow(row, { seenNationalIds, resolveVillage });
        if (!validated.ok) {
          skipped += 1;
          errors.push(...validated.errors);
          continue;
        }

        try {
          await assertNationalIdAvailable("household", null, validated.national_id, prisma);
        } catch (e) {
          if (e instanceof ApiError && e.statusCode === 409) {
            skipped += 1;
            errors.push({
              line: row.line,
              national_id: validated.national_id,
              code: "duplicate_national_id",
              message: "national_id already registered",
            });
            continue;
          }
          throw e;
        }

        const mobile =
          validated.mobile ??
          placeholderMobileForNationalId(validated.national_id, coopId);

        const user = await usersRepo.upsertUserByMobile(mobile, "HOUSEHOLD", {
          is_active: false,
          cooperative_id: coopId,
        });

        let created: householdsRepo.HouseholdRow;
        try {
          created = await prisma.$transaction(async (tx) => {
            const h = await tx.households.create({
              data: {
                user_id: BigInt(user.id),
                village_id: BigInt(validated.village_id),
                cooperative_id: BigInt(coopId),
                head_name: row.full_name.trim(),
                national_id: validated.national_id,
                status,
              },
            });
            await walletsRepo.findOrCreateHouseholdWallet(Number(h.id), tx);
            return {
              id: Number(h.id),
              user_id: user.id,
              village_id: validated.village_id,
              cooperative_id: coopId,
              head_name: row.full_name.trim(),
              national_id: validated.national_id,
              bank_iban: undefined,
              status,
            };
          });
        } catch {
          skipped += 1;
          errors.push({
            line: row.line,
            national_id: validated.national_id,
            code: "import_failed",
            message: "Could not create household",
          });
          continue;
        }

        await appContext.entities.updateHouseholdInCache({
          id: created.id,
          user_id: created.user_id,
          village_id: created.village_id,
          cooperative_id: created.cooperative_id,
          head_name: created.head_name,
          national_id: created.national_id,
          bank_iban: created.bank_iban,
          status: created.status as "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED" | "NEEDS_CORRECTION",
        });
        imported += 1;
      }

      await appContext.auditStore.record({
        entity_type: "households",
        entity_id: String(coopId),
        action: "households.bulk_import",
        after_value: {
          cooperative_id: coopId,
          row_count: parsedRows.length,
          imported,
          skipped,
          auto_approve: env.IMPORT_AUTO_APPROVE,
        },
        performed_by_user_id: auth.user.id,
      });

      return res.json(success({ imported, skipped, errors, dry_run: false }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/coop/objections",
  requireAuth,
  requirePermission("objection:create"),
  async (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;
    if (!auth.user?.id) {
      return next(new ApiError({ statusCode: 401, code: "unauthorized", message: "Not authenticated", requestId }));
    }

    const body = z
      .object({
        household_id: z.number().int().positive(),
        reason: z.string().min(3),
      })
      .strict()
      .safeParse(req.body);
    if (!body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
    }

    const household = appContext.entities.findHouseholdById(body.data.household_id);
    if (!household) {
      return next(new ApiError({ statusCode: 404, code: "household_not_found", message: "Household not found", requestId }));
    }
    if (household.cooperative_id == null) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Household has no cooperative", requestId }));
    }

    const scoped = filterHouseholdsByScope([household], auth);
    if (scoped.length === 0 && normalizeRole(auth.user.role) !== "ADMIN") {
      return next(new ApiError({ statusCode: 403, code: "forbidden", message: "Household outside cooperative scope", requestId }));
    }

    const reporterUserId = auth.user.id;
    const created = await appContext.entities.createObjection({
      cooperative_id: household.cooperative_id,
      household_id: body.data.household_id,
      reporter_user_id: reporterUserId,
      reason: body.data.reason,
    });
    if (!created) {
      return next(new ApiError({ statusCode: 404, code: "household_not_found", message: "Household not found", requestId }));
    }
    await appContext.auditStore.record({
      entity_type: "membership_objection",
      entity_id: String(created.id),
      action: "objection_submitted",
      after_value: created,
      performed_by_user_id: auth.user.id,
      reason: created.reason,
    });
    return res.json(success({ objection: await objectionDto(created) }, requestId));
  },
);

router.patch(
  "/coop/objections/:id/resolve",
  requireAuth,
  requireRoles(["COOP_ADMIN", "ADMIN"]),
  requireCooperativeScope(),
  requireActiveCooperative(),
  async (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;
    const oid = z.coerce.number().int().positive().safeParse(req.params.id);
    const body = z
      .object({
        resolution_reason: z.string().min(3),
      })
      .safeParse(req.body);
    if (!oid.success || !body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
    }

    const objection = await appContext.entities.findObjectionById(oid.data);
    if (!objection) {
      return next(new ApiError({ statusCode: 404, code: "objection_not_found", message: "Objection not found", requestId }));
    }

    const coopId = auth.scope?.cooperativeId;
    if (coopId != null && objection.cooperative_id !== coopId && normalizeRole(auth.user.role) !== "ADMIN") {
      return next(new ApiError({ statusCode: 403, code: "forbidden", message: "Objection outside cooperative scope", requestId }));
    }

    if (objection.status !== "PENDING") {
      return next(new ApiError({ statusCode: 409, code: "objection_already_resolved", message: "Objection already resolved", requestId }));
    }

    const updated = await appContext.entities.resolveObjection({
      objection_id: oid.data,
      resolved_by: auth.user.id,
      resolution_reason: body.data.resolution_reason,
    });
    if (!updated) {
      return next(new ApiError({ statusCode: 404, code: "objection_not_found", message: "Objection not found", requestId }));
    }
    await appContext.auditStore.record({
      entity_type: "membership_objection",
      entity_id: String(updated.id),
      action: "objection_resolved",
      after_value: updated,
      performed_by_user_id: auth.user.id,
      reason: body.data.resolution_reason,
    });
    return res.json(success({ objection: await objectionDto(updated) }, requestId));
  },
);

export const coopRouter = router;
