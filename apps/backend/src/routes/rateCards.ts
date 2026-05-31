import { Router } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requireRoles } from "../middleware/rbac";
import { requireCooperativeScope } from "../middleware/scope";
import { requireMineContext } from "../middleware/requireMineContext";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import { resolveEffectiveMineId } from "../lib/mineScope";
import { normalizeRole } from "../types/userRole";
import * as rateCardsRepo from "../repositories/rateCardsRepository";
import * as cooperativesRepo from "../repositories/cooperativesRepository";

const router = Router();
const requireAuth = authMiddleware(resolveAuthContext);

const RATE_WRITE_ROLES = ["ADMIN", "OPERATION_ADMIN", "COOP_ADMIN"] as const;
const RATE_READ_ROLES = ["ADMIN", "OPERATION_ADMIN", "COOP_ADMIN", "CONSULTANT", "COOP"] as const;

function getAuth(req: import("express").Request): AuthContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req as any).auth as AuthContext;
}

async function assertMineWriteScope(
  auth: AuthContext,
  mineId: number,
  cooperativeId?: number,
): Promise<void> {
  const role = normalizeRole(auth.user.role);
  if (role === "ADMIN" || role === "OPERATION_ADMIN") return;

  if (role === "COOP_ADMIN") {
    const coopId = auth.scope?.cooperativeId;
    if (!coopId) {
      throw new ApiError({ statusCode: 403, code: "forbidden", message: "No cooperative scope" });
    }
    const coop = await cooperativesRepo.findCooperativeById(coopId);
    if (!coop || coop.mine_id !== mineId) {
      throw new ApiError({
        statusCode: 403,
        code: "forbidden",
        message: "Rate card mine must match your cooperative mine",
      });
    }
    if (cooperativeId != null && cooperativeId !== coopId) {
      throw new ApiError({
        statusCode: 403,
        code: "forbidden",
        message: "cooperative_id must match your cooperative",
      });
    }
    return;
  }

  throw new ApiError({ statusCode: 403, code: "forbidden", message: "Insufficient role" });
}

async function resolveListScope(auth: AuthContext): Promise<{ mine_id?: number; cooperative_id?: number }> {
  const role = normalizeRole(auth.user.role);
  if (role === "ADMIN") {
    return auth.mineId != null ? { mine_id: auth.mineId } : {};
  }
  if (role === "OPERATION_ADMIN") {
    if (!auth.mineId) return { mine_id: -1 };
    return { mine_id: auth.mineId };
  }
  if (role === "COOP_ADMIN") {
    const coopId = auth.scope?.cooperativeId;
    if (!coopId) return { mine_id: -1 };
    const coop = await cooperativesRepo.findCooperativeById(coopId);
    if (!coop) return { mine_id: -1 };
    if (auth.mineId != null && coop.mine_id !== auth.mineId) return { mine_id: -1 };
    return { mine_id: coop.mine_id, cooperative_id: coopId };
  }
  if (role === "CONSULTANT") {
    if (!auth.mineId) return { mine_id: -1 };
    return { mine_id: auth.mineId };
  }
  return {};
}

router.get("/rate-cards", requireAuth, requireMineContext(), requireRoles([...RATE_READ_ROLES]), async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const auth = getAuth(req);
    const q = z
      .object({
        mine_id: z.coerce.number().int().positive().optional(),
        date: z.string().optional(),
        include_drafts: z.enum(["0", "1"]).optional(),
      })
      .safeParse(req.query);

    if (!q.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid query", requestId }));
    }

    const scope = await resolveListScope(auth);
    const at = q.data.date ? new Date(q.data.date) : new Date();
    const mineId = resolveEffectiveMineId(auth, q.data.mine_id ?? scope.mine_id, requestId);

    let rows: rateCardsRepo.RateCardRow[];
    if (q.data.include_drafts === "1") {
      const all = await rateCardsRepo.listRateCardRows();
      rows = all.filter((r) => {
        if (mineId != null && r.mine_id !== mineId) return false;
        if (scope.cooperative_id != null && r.cooperative_id !== scope.cooperative_id) return false;
        return true;
      });
    } else {
      rows = await rateCardsRepo.listValidRateCards({
        mine_id: mineId,
        cooperative_id: scope.cooperative_id,
        date: at,
      });
    }

    return res.json(
      success(
        {
          rate_cards: rows.map(rateCardsRepo.toMvp),
          as_of: at.toISOString().slice(0, 10),
        },
        requestId,
      ),
    );
  } catch (e) {
    next(e);
  }
});

router.post(
  "/rate-cards",
  requireAuth,
  requireRoles([...RATE_WRITE_ROLES]),
  requireCooperativeScope(),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    try {
      const auth = getAuth(req);
      const body = z
        .object({
          mine_id: z.number().int().positive(),
          cooperative_id: z.number().int().positive().optional(),
          operation_type: z.enum(["TONNAGE", "HOURLY"]),
          material_type: z.string().min(1),
          unit_type: z.enum(["TON", "HOUR"]),
          rate: z.number().positive(),
          effective_from: z.string(),
        })
        .safeParse(req.body);

      if (!body.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
      }

      const role = normalizeRole(auth.user.role);
      let cooperativeId = body.data.cooperative_id;
      if (role === "COOP_ADMIN") {
        cooperativeId = auth.scope?.cooperativeId;
      }

      await assertMineWriteScope(auth, body.data.mine_id, cooperativeId);

      const card = await rateCardsRepo.createDraftRateCard({
        mine_id: body.data.mine_id,
        cooperative_id: cooperativeId,
        operation_type: body.data.operation_type,
        material_type: body.data.material_type,
        unit_type: body.data.unit_type,
        rate: body.data.rate,
        effective_from: new Date(body.data.effective_from),
        created_by: auth.user.id,
      });

      await appContext.auditStore.record({
        entity_type: "rate_card",
        entity_id: String(card.id),
        action: "CREATED_DRAFT",
        after_value: card,
        performed_by_user_id: auth.user.id,
        reason: "rate_card_draft",
        requestId,
      });

      return res.status(201).json(success({ rate_card: rateCardsRepo.toMvp(card) }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/rate-cards/:id/activate",
  requireAuth,
  requireRoles([...RATE_WRITE_ROLES]),
  requireCooperativeScope(),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    try {
      const auth = getAuth(req);
      const id = z.coerce.number().int().positive().safeParse(req.params.id);
      if (!id.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid id", requestId }));
      }

      const existing = await rateCardsRepo.getRateCardById(id.data);
      if (!existing) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Rate card not found", requestId }));
      }

      await assertMineWriteScope(auth, existing.mine_id, existing.cooperative_id);

      let result: { activated: rateCardsRepo.RateCardRow; archived: rateCardsRepo.RateCardRow[] };
      try {
        result = await rateCardsRepo.activateRateCard(id.data, auth.user.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "activate_failed";
        if (msg === "not_draft") {
          return next(
            new ApiError({ statusCode: 409, code: "not_draft", message: "Only DRAFT cards can be activated", requestId }),
          );
        }
        throw e;
      }

      await appContext.finance.hydrateRateCards();

      return res.json(
        success(
          {
            rate_card: rateCardsRepo.toMvp(result.activated),
            archived: result.archived.map(rateCardsRepo.toMvp),
          },
          requestId,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

export const rateCardsRouter = router;
