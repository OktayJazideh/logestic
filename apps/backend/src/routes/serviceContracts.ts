import { Router } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requirePermission, requireRoles } from "../middleware/rbac";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import { normalizeRole } from "../types/userRole";
import * as cooperativesRepo from "../repositories/cooperativesRepository";
import * as serviceContractsRepo from "../repositories/serviceContractsRepository";

const router = Router();
const requireAuth = authMiddleware(resolveAuthContext);

const CONTRACT_WRITE_ROLES = ["ADMIN", "OPERATION_ADMIN", "COOP_ADMIN"] as const;
const CONTRACT_READ_ROLES = ["ADMIN", "OPERATION_ADMIN", "COOP_ADMIN", "CONSULTANT", "COOP"] as const;

const operationTypeSchema = z.enum([
  "HAUL_TONNAGE",
  "WATER_LITER",
  "FOOD_COUNT",
  "WASTE_TON",
  "EQUIPMENT_HOUR",
]);
const unitSchema = z.enum(["TON", "LITER", "HOUR", "COUNT"]);

function getAuth(req: import("express").Request): AuthContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req as any).auth as AuthContext;
}

async function assertContractWriteScope(
  auth: AuthContext,
  mineId: number,
  cooperativeId: number,
): Promise<void> {
  const role = normalizeRole(auth.user.role);
  if (role === "ADMIN" || role === "OPERATION_ADMIN") return;

  if (role === "COOP_ADMIN") {
    const coopId = auth.scope?.cooperativeId;
    if (!coopId || coopId !== cooperativeId) {
      throw new ApiError({ statusCode: 403, code: "forbidden", message: "Cooperative scope mismatch" });
    }
    const coop = await cooperativesRepo.findCooperativeById(coopId);
    if (!coop || coop.mine_id !== mineId) {
      throw new ApiError({ statusCode: 403, code: "forbidden", message: "Mine must match cooperative" });
    }
    return;
  }

  throw new ApiError({ statusCode: 403, code: "forbidden", message: "Insufficient role" });
}

const createBodySchema = z.object({
  cooperative_id: z.number().int().positive(),
  operation_type_code: operationTypeSchema,
  unit: unitSchema,
  base_rate_rial: z.number().positive(),
  fixed_community_amount_rial_per_unit: z.number().positive(),
  rate_card_id: z.number().int().positive().optional(),
  valid_from: z.string(),
  valid_to: z.string().optional(),
});

router.get(
  "/mines/:mineId/service-contracts/versions",
  requireAuth,
  requireRoles([...CONTRACT_READ_ROLES]),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    try {
      const mineId = z.coerce.number().int().positive().safeParse(req.params.mineId);
      if (!mineId.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid mine id", requestId }));
      }

      const q = z
        .object({
          operation_type: operationTypeSchema.default("HAUL_TONNAGE"),
          cooperative_id: z.coerce.number().int().positive().optional(),
        })
        .safeParse(req.query);

      if (!q.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid query", requestId }));
      }

      const auth = getAuth(req);
      let cooperativeId = q.data.cooperative_id;
      const role = normalizeRole(auth.user.role);
      if (role === "COOP_ADMIN") {
        cooperativeId = auth.scope?.cooperativeId;
      }
      if (!cooperativeId) {
        return next(
          new ApiError({
            statusCode: 400,
            code: "cooperative_required",
            message: "cooperative_id query parameter required",
            requestId,
          }),
        );
      }

      const versions = await serviceContractsRepo.listServiceContractVersions({
        mine_id: mineId.data,
        cooperative_id: cooperativeId,
        operation_type_code: q.data.operation_type,
      });

      return res.json(
        success(
          {
            service_contracts: versions.map((v) => serviceContractsRepo.toApi(v)),
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
  "/mines/:mineId/service-contracts/active",
  requireAuth,
  requireRoles([...CONTRACT_READ_ROLES]),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    try {
      const mineId = z.coerce.number().int().positive().safeParse(req.params.mineId);
      if (!mineId.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid mine id", requestId }));
      }

      const q = z
        .object({
          operation_type: operationTypeSchema.default("HAUL_TONNAGE"),
          cooperative_id: z.coerce.number().int().positive().optional(),
          date: z.string().optional(),
        })
        .safeParse(req.query);

      if (!q.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid query", requestId }));
      }

      const auth = getAuth(req);
      let cooperativeId = q.data.cooperative_id;
      const role = normalizeRole(auth.user.role);
      if (role === "COOP_ADMIN") {
        cooperativeId = auth.scope?.cooperativeId;
      }
      if (!cooperativeId) {
        return next(
          new ApiError({
            statusCode: 400,
            code: "cooperative_required",
            message: "cooperative_id query parameter required",
            requestId,
          }),
        );
      }

      const at = q.data.date ? new Date(q.data.date) : new Date();
      const contract = await serviceContractsRepo.findActiveServiceContract({
        mine_id: mineId.data,
        cooperative_id: cooperativeId,
        operation_type_code: q.data.operation_type,
        at,
      });

      if (!contract) {
        return next(
          new ApiError({ statusCode: 404, code: "not_found", message: "No active service contract", requestId }),
        );
      }

      return res.json(success({ service_contract: serviceContractsRepo.toApi(contract) }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/mines/:mineId/service-contracts",
  requireAuth,
  requireRoles([...CONTRACT_WRITE_ROLES]),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    try {
      const mineId = z.coerce.number().int().positive().safeParse(req.params.mineId);
      if (!mineId.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid mine id", requestId }));
      }

      const body = createBodySchema.safeParse(req.body);
      if (!body.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
      }

      const auth = getAuth(req);
      let cooperativeId = body.data.cooperative_id;
      if (normalizeRole(auth.user.role) === "COOP_ADMIN") {
        cooperativeId = auth.scope?.cooperativeId ?? cooperativeId;
      }

      await assertContractWriteScope(auth, mineId.data, cooperativeId);

      const contract = await serviceContractsRepo.createDraftServiceContract({
        mine_id: mineId.data,
        cooperative_id: cooperativeId,
        operation_type_code: body.data.operation_type_code,
        unit: body.data.unit,
        base_rate_rial: body.data.base_rate_rial,
        fixed_community_amount_rial_per_unit: body.data.fixed_community_amount_rial_per_unit,
        rate_card_id: body.data.rate_card_id,
        valid_from: new Date(body.data.valid_from),
        valid_to: body.data.valid_to ? new Date(body.data.valid_to) : undefined,
        created_by: auth.user.id,
      });

      await appContext.auditStore.record({
        entity_type: "service_contract",
        entity_id: String(contract.id),
        action: "CREATED_DRAFT",
        after_value: serviceContractsRepo.toApi(contract),
        performed_by_user_id: auth.user.id,
        reason: "service_contract_draft",
        requestId,
      });

      return res.status(201).json(success({ service_contract: serviceContractsRepo.toApi(contract) }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.put(
  "/mines/:mineId/service-contracts/:id",
  requireAuth,
  requireRoles([...CONTRACT_WRITE_ROLES]),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    try {
      const mineId = z.coerce.number().int().positive().safeParse(req.params.mineId);
      const id = z.coerce.number().int().positive().safeParse(req.params.id);
      if (!mineId.success || !id.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid id", requestId }));
      }

      const body = z
        .object({
          base_rate_rial: z.number().positive().optional(),
          fixed_community_amount_rial_per_unit: z.number().positive().optional(),
          rate_card_id: z.number().int().positive().nullable().optional(),
          valid_from: z.string().optional(),
          valid_to: z.string().nullable().optional(),
          sign_mine: z.boolean().optional(),
          sign_coop: z.boolean().optional(),
        })
        .safeParse(req.body);

      if (!body.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
      }

      const existing = await serviceContractsRepo.getServiceContractById(id.data);
      if (!existing || existing.mine_id !== mineId.data) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Contract not found", requestId }));
      }

      const auth = getAuth(req);
      await assertContractWriteScope(auth, existing.mine_id, existing.cooperative_id);

      const role = normalizeRole(auth.user.role);
      const patch: Parameters<typeof serviceContractsRepo.updateDraftServiceContract>[1] = {};
      if (body.data.base_rate_rial != null) patch.base_rate_rial = body.data.base_rate_rial;
      if (body.data.fixed_community_amount_rial_per_unit != null) {
        patch.fixed_community_amount_rial_per_unit = body.data.fixed_community_amount_rial_per_unit;
      }
      if (body.data.rate_card_id !== undefined) patch.rate_card_id = body.data.rate_card_id;
      if (body.data.valid_from) patch.valid_from = new Date(body.data.valid_from);
      if (body.data.valid_to !== undefined) {
        patch.valid_to = body.data.valid_to ? new Date(body.data.valid_to) : null;
      }
      if (body.data.sign_mine && (role === "OPERATION_ADMIN" || role === "ADMIN")) {
        patch.signed_at_mine = new Date();
      }
      if (body.data.sign_coop && (role === "COOP_ADMIN" || role === "ADMIN")) {
        patch.signed_at_coop = new Date();
      }

      let contract: serviceContractsRepo.ServiceContractRow;
      try {
        contract = await serviceContractsRepo.updateDraftServiceContract(id.data, patch);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "update_failed";
        if (msg === "not_draft") {
          return next(new ApiError({ statusCode: 409, code: "not_draft", message: "Only DRAFT contracts can be updated", requestId }));
        }
        throw e;
      }

      return res.json(success({ service_contract: serviceContractsRepo.toApi(contract) }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/mines/:mineId/service-contracts/:id/activate",
  requireAuth,
  requireRoles([...CONTRACT_WRITE_ROLES]),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    try {
      const id = z.coerce.number().int().positive().safeParse(req.params.id);
      if (!id.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid id", requestId }));
      }

      const existing = await serviceContractsRepo.getServiceContractById(id.data);
      if (!existing) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Contract not found", requestId }));
      }

      const auth = getAuth(req);
      await assertContractWriteScope(auth, existing.mine_id, existing.cooperative_id);

      let result: Awaited<ReturnType<typeof serviceContractsRepo.activateServiceContract>>;
      try {
        result = await serviceContractsRepo.activateServiceContract(id.data, auth.user.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "activate_failed";
        if (msg === "not_draft") {
          return next(new ApiError({ statusCode: 409, code: "not_draft", message: "Only DRAFT can be activated", requestId }));
        }
        if (msg === "dual_signature_required") {
          return next(
            new ApiError({
              statusCode: 409,
              code: "dual_signature_required",
              message: "Both mine (OPERATION_ADMIN) and cooperative signatures required",
              requestId,
            }),
          );
        }
        if (
          msg === "rate_card_not_found" ||
          msg === "rate_card_not_active" ||
          msg === "rate_card_mine_mismatch" ||
          msg === "rate_card_coop_mismatch" ||
          msg === "rate_card_not_valid_at" ||
          msg === "rate_card_already_linked_active_contract"
        ) {
          return next(new ApiError({ statusCode: 409, code: msg, message: msg, requestId }));
        }
        throw e;
      }

      return res.json(
        success(
          {
            service_contract: serviceContractsRepo.toApi(result.activated),
            superseded: result.superseded ? serviceContractsRepo.toApi(result.superseded) : null,
          },
          requestId,
        ),
      );
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        return next(
          new ApiError({
            statusCode: 409,
            code: "active_contract_exists",
            message: "Another ACTIVE contract exists for this mine, cooperative, and operation type",
            requestId,
          }),
        );
      }
      next(e);
    }
  },
);

router.post(
  "/service-contracts/:id/new-version",
  requireAuth,
  requirePermission("contract:amend"),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    try {
      const id = z.coerce.number().int().positive().safeParse(req.params.id);
      if (!id.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid id", requestId }));
      }

      const body = z
        .object({
          amendment_ref: z.string().min(1),
          valid_from: z.string(),
          base_rate_rial: z.number().positive(),
          fixed_community_amount_rial_per_unit: z.number().positive(),
          rate_card_id: z.number().int().positive().nullable().optional(),
        })
        .safeParse(req.body);

      if (!body.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
      }

      const existing = await serviceContractsRepo.getServiceContractById(id.data);
      if (!existing) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Contract not found", requestId }));
      }

      const auth = getAuth(req);
      await assertContractWriteScope(auth, existing.mine_id, existing.cooperative_id);

      let result: Awaited<ReturnType<typeof serviceContractsRepo.createNewServiceContractVersion>>;
      try {
        result = await serviceContractsRepo.createNewServiceContractVersion({
          source_id: id.data,
          amendment_ref: body.data.amendment_ref,
          valid_from: new Date(body.data.valid_from),
          base_rate_rial: body.data.base_rate_rial,
          fixed_community_amount_rial_per_unit: body.data.fixed_community_amount_rial_per_unit,
          rate_card_id: body.data.rate_card_id,
          performed_by_user_id: auth.user.id,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "new_version_failed";
        if (msg === "not_active") {
          return next(
            new ApiError({
              statusCode: 409,
              code: "not_active",
              message: "Only ACTIVE contracts can spawn a new version",
              requestId,
            }),
          );
        }
        if (msg === "draft_already_exists") {
          return next(
            new ApiError({
              statusCode: 409,
              code: "draft_already_exists",
              message: "A DRAFT version already exists for this mine, cooperative, and operation type",
              requestId,
            }),
          );
        }
        throw e;
      }

      await appContext.auditStore.record({
        entity_type: "service_contract",
        entity_id: String(result.draft.id),
        action: "NEW_VERSION_CREATED",
        after_value: serviceContractsRepo.toApi(result.draft),
        performed_by_user_id: auth.user.id,
        reason: body.data.amendment_ref,
        requestId,
      });

      return res.status(201).json(
        success(
          {
            service_contract: serviceContractsRepo.toApi(result.draft),
            previous_active_adjusted: result.previous_active_adjusted
              ? serviceContractsRepo.toApi(result.previous_active_adjusted)
              : null,
          },
          requestId,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/mines/:mineId/service-contracts/:id/amend",
  requireAuth,
  requirePermission("contract:amend"),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    try {
      const id = z.coerce.number().int().positive().safeParse(req.params.id);
      if (!id.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid id", requestId }));
      }

      const body = z
        .object({
          amendment_ref: z.string().min(1),
          fixed_community_amount_rial_per_unit: z.number().positive().optional(),
          base_rate_rial: z.number().positive().optional(),
          rate_card_id: z.number().int().positive().nullable().optional(),
          valid_from: z.string(),
        })
        .safeParse(req.body);

      if (!body.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
      }

      const existing = await serviceContractsRepo.getServiceContractById(id.data);
      if (!existing) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Contract not found", requestId }));
      }

      const auth = getAuth(req);
      await assertContractWriteScope(auth, existing.mine_id, existing.cooperative_id);

      let result: Awaited<ReturnType<typeof serviceContractsRepo.amendServiceContract>>;
      try {
        result = await serviceContractsRepo.amendServiceContract({
          active_id: id.data,
          amendment_ref: body.data.amendment_ref,
          fixed_community_amount_rial_per_unit: body.data.fixed_community_amount_rial_per_unit,
          base_rate_rial: body.data.base_rate_rial,
          rate_card_id: body.data.rate_card_id,
          valid_from: new Date(body.data.valid_from),
          performed_by_user_id: auth.user.id,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "amend_failed";
        if (msg === "not_active") {
          return next(new ApiError({ statusCode: 409, code: "not_active", message: "Only ACTIVE contracts can be amended", requestId }));
        }
        throw e;
      }

      return res.json(
        success(
          {
            superseded: serviceContractsRepo.toApi(result.superseded),
            draft: serviceContractsRepo.toApi(result.draft),
          },
          requestId,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

export const serviceContractsRouter = router;
