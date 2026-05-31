import { Router } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requireRoles } from "../middleware/rbac";
import { requireMineContext, requireSessionMineWorkspace } from "../middleware/requireMineContext";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import { resolveEffectiveMineId } from "../lib/mineScope";
import { buildSimplePdf } from "../lib/simplePdf";
import {
  getFinanceSummary,
  listFinanceByLoad,
  listVerifiedMissionsForPeriod,
  revealIban,
  summaryToCsv,
  summaryToPdfLines,
} from "../services/adminFinanceService";
import {
  approvePeriodStatement,
  createPeriodStatementDraft,
  getPeriodStatement,
  listPeriodStatements,
  lockPeriodStatement,
  periodKeyFromParts,
  registerMinePayment,
  rejectPeriodStatement,
  submitPeriodStatementForReview,
  updatePeriodStatementLine,
} from "../services/periodStatementService";
import * as settlementRepo from "../repositories/settlementRepository";
import { normalizeRole } from "../types/userRole";

const router = Router();
const requireAuth = authMiddleware(resolveAuthContext);
const requireSettlementMine = [requireMineContext(), requireSessionMineWorkspace()] as const;
const requireAdmin = [requireAuth, ...requireSettlementMine, requireRoles(["ADMIN"])] as const;
const periodStatementReaders = [
  requireAuth,
  ...requireSettlementMine,
  requireRoles(["ADMIN", "OPERATION_ADMIN", "COOP_ADMIN"]),
] as const;
const periodStatementDrafters = [
  requireAuth,
  ...requireSettlementMine,
  requireRoles(["ADMIN", "OPERATION_ADMIN"]),
] as const;
const paymentReferenceSchema = z.string().min(8, "payment_reference must be at least 8 characters");

const periodQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  mine_id: z.coerce.number().int().positive().optional(),
});

function parsePeriodQuery(req: { query: Record<string, unknown> }, requestId?: string) {
  const parsed = periodQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError({
      statusCode: 400,
      code: "invalid_request",
      message: "year and month query params required",
      requestId,
    });
  }
  return parsed.data;
}

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const byLoadQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  mine_id: z.coerce.number().int().positive().optional(),
  status: z.enum(["VERIFIED", "SETTLED"]).catch("VERIFIED"),
});

function parseByLoadDateRange(from: string, to: string, requestId?: string) {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toExclusive = new Date(`${to}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  if (fromDate.getTime() > toExclusive.getTime() - 1) {
    throw new ApiError({
      statusCode: 400,
      code: "invalid_date_range",
      message: "from must be on or before to",
      requestId,
    });
  }
  return { fromDate, toExclusive };
}

router.get("/admin/finance/by-load", ...requireAdmin, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as typeof req & { auth: AuthContext }).auth;
  try {
    const parsed = byLoadQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError({
        statusCode: 400,
        code: "invalid_request",
        message: "from and to query params required (YYYY-MM-DD)",
        requestId,
      });
    }
    const mine_id = resolveEffectiveMineId(auth, parsed.data.mine_id, requestId);
    const { fromDate, toExclusive } = parseByLoadDateRange(parsed.data.from, parsed.data.to, requestId);
    const result = await listFinanceByLoad(fromDate, toExclusive, mine_id, parsed.data.status);
    return res.json(
      success(
        {
          items: result.items,
          totals: result.totals,
          period: { from: parsed.data.from, to: parsed.data.to, mine_id },
        },
        requestId,
      ),
    );
  } catch (e) {
    next(e);
  }
});

router.get("/admin/finance/summary", ...requireAdmin, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as typeof req & { auth: AuthContext }).auth;
  try {
    const parsed = parsePeriodQuery(req, requestId);
    const mine_id = resolveEffectiveMineId(auth, parsed.mine_id, requestId);
    const summary = await getFinanceSummary(parsed.year, parsed.month, mine_id);
    return res.json(success({ summary }, requestId));
  } catch (e) {
    next(e);
  }
});

router.get("/admin/finance/missions", ...requireAdmin, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as typeof req & { auth: AuthContext }).auth;
  try {
    const parsed = parsePeriodQuery(req, requestId);
    const mine_id = resolveEffectiveMineId(auth, parsed.mine_id, requestId);
    const missions = await listVerifiedMissionsForPeriod(parsed.year, parsed.month, mine_id);
    return res.json(success({ missions, period: { year: parsed.year, month: parsed.month, mine_id } }, requestId));
  } catch (e) {
    next(e);
  }
});

router.post("/admin/finance/iban/reveal", ...requireAdmin, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const body = z
    .object({
      entity_type: z.enum(["fleet_owner", "household", "cooperative"]),
      entity_id: z.number().int().positive(),
      reason: z.string().min(3).max(2000),
    })
    .safeParse(req.body);

  if (!body.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
  }

  const auth = (req as typeof req & { auth: AuthContext }).auth;
  try {
    const revealed = await revealIban(body.data.entity_type, body.data.entity_id);
    if (!revealed) {
      return next(
        new ApiError({
          statusCode: 404,
          code: "iban_not_found",
          message: "IBAN not found for entity",
          requestId,
        }),
      );
    }

    await appContext.auditStore.record({
      entity_type: body.data.entity_type,
      entity_id: String(body.data.entity_id),
      action: "IBAN_REVEALED",
      performed_by_user_id: auth.user.id,
      reason: body.data.reason,
      after_value: { iban_last4: revealed.iban.slice(-4) },
    });

    return res.json(success({ iban: revealed.iban }, requestId));
  } catch (e) {
    next(e);
  }
});

router.get("/admin/finance/export", ...requireAdmin, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as typeof req & { auth: AuthContext }).auth;
  try {
    const parsed = parsePeriodQuery(req, requestId);
    const mine_id = resolveEffectiveMineId(auth, parsed.mine_id, requestId);
    const format = z.enum(["excel", "csv", "pdf"]).catch("excel").parse(req.query.format ?? "excel");
    const summary = await getFinanceSummary(parsed.year, parsed.month, mine_id);
    const pk = `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;
    const mineSuffix = `-mine${mine_id}`;

    if (format === "pdf") {
      const pdf = buildSimplePdf(summaryToPdfLines(summary));
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="finance-${pk}${mineSuffix}.pdf"`);
      return res.send(pdf);
    }

    const csv = summaryToCsv(summary);
    const ext = format === "csv" ? "csv" : "csv";
    res.setHeader(
      "Content-Type",
      format === "excel" ? "application/vnd.ms-excel; charset=utf-8" : "text/csv; charset=utf-8",
    );
    res.setHeader("Content-Disposition", `attachment; filename="finance-${pk}${mineSuffix}.${ext}"`);
    return res.send(csv);
  } catch (e) {
    next(e);
  }
});

function periodStatementScopeError(
  auth: AuthContext,
  statement: { cooperative_id: number; mine_id: number },
  requestId?: string,
): ApiError | null {
  const role = normalizeRole(auth.user.role);
  if (role !== "ADMIN") {
    if (!auth.mineId) {
      return new ApiError({
        statusCode: 400,
        code: "mine_not_selected",
        message: "Select workspace (mine) first",
        requestId,
      });
    }
    if (statement.mine_id !== auth.mineId) {
      return new ApiError({
        statusCode: 403,
        code: "mine_mismatch",
        message: "Period statement does not belong to selected mine",
        requestId,
      });
    }
  }
  if (role === "COOP_ADMIN" && auth.user.cooperative_id !== statement.cooperative_id) {
    return new ApiError({
      statusCode: 403,
      code: "forbidden",
      message: "Cooperative scope mismatch",
      requestId,
    });
  }
  return null;
}

router.post("/admin/finance/period-statements/draft", ...periodStatementDrafters, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as typeof req & { auth: AuthContext }).auth;
  const body = z
    .object({
      mine_id: z.number().int().positive(),
      cooperative_id: z.number().int().positive(),
      year: z.number().int().min(2020).max(2100),
      month: z.number().int().min(1).max(12),
      deductions_rial: z.number().min(0).optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
  }
  try {
    const mine_id = resolveEffectiveMineId(auth, body.data.mine_id, requestId);
    const r = await createPeriodStatementDraft({
      ...body.data,
      mine_id,
      created_by_user_id: auth.user.id,
    });
    if (!r.ok) {
      const status = r.reason === "statement_locked" ? 409 : 400;
      return next(new ApiError({ statusCode: status, code: r.reason, message: r.reason, requestId }));
    }
    return res.status(201).json(success({ statement: r.statement }, requestId));
  } catch (e) {
    next(e);
  }
});

router.get("/admin/finance/period-statements", ...periodStatementReaders, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as typeof req & { auth: AuthContext }).auth;
  const q = z
    .object({
      mine_id: z.coerce.number().int().positive().optional(),
      cooperative_id: z.coerce.number().int().positive().optional(),
      period_key: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      year: z.coerce.number().int().optional(),
      month: z.coerce.number().int().min(1).max(12).optional(),
    })
    .safeParse(req.query);
  if (!q.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid query", requestId }));
  }
  try {
    let cooperative_id = q.data.cooperative_id;
    const role = normalizeRole(auth.user.role);
    if (role === "COOP_ADMIN") {
      cooperative_id = auth.user.cooperative_id ?? cooperative_id;
    }
    const mine_id =
      role === "ADMIN"
        ? resolveEffectiveMineId(auth, q.data.mine_id, requestId)
        : resolveEffectiveMineId(auth, q.data.mine_id ?? auth.mineId, requestId);
    const period_key =
      q.data.period_key ??
      (q.data.year != null && q.data.month != null
        ? periodKeyFromParts(q.data.year, q.data.month)
        : undefined);
    const statements = await listPeriodStatements({
      mine_id,
      cooperative_id,
      period_key,
    });
    return res.json(success({ statements }, requestId));
  } catch (e) {
    next(e);
  }
});

router.get("/admin/finance/period-statements/:id", ...periodStatementReaders, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as typeof req & { auth: AuthContext }).auth;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_id", message: "Invalid id", requestId }));
  }
  try {
    const statement = await getPeriodStatement(id.data);
    if (!statement) {
      return next(new ApiError({ statusCode: 404, code: "not_found", message: "Not found", requestId }));
    }
    const scopeErr = periodStatementScopeError(auth, statement, requestId);
    if (scopeErr) return next(scopeErr);
    return res.json(success({ statement }, requestId));
  } catch (e) {
    next(e);
  }
});

router.post(
  "/admin/finance/period-statements/:id/submit-review",
  ...periodStatementDrafters,
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    const auth = (req as typeof req & { auth: AuthContext }).auth;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_id", message: "Invalid id", requestId }));
    }
    try {
      const r = await submitPeriodStatementForReview(id.data, auth.user.id);
      if (!r.ok) {
        return next(new ApiError({ statusCode: 400, code: r.reason, message: r.reason, requestId }));
      }
      return res.json(success({ statement: r.statement }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.post("/admin/finance/period-statements/:id/approve", ...periodStatementReaders, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as typeof req & { auth: AuthContext }).auth;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_id", message: "Invalid id", requestId }));
  }
  try {
    const existing = await getPeriodStatement(id.data);
    if (!existing) {
      return next(new ApiError({ statusCode: 404, code: "not_found", message: "Not found", requestId }));
    }
    const scopeErr = periodStatementScopeError(auth, existing, requestId);
    if (scopeErr) return next(scopeErr);

    const r = await approvePeriodStatement({
      statementId: id.data,
      userId: auth.user.id,
      userRole: auth.user.role,
      cooperativeId: auth.user.cooperative_id,
    });
    if (!r.ok) {
      const status = r.reason === "role_cannot_approve" || r.reason === "cooperative_scope" ? 403 : 400;
      return next(new ApiError({ statusCode: status, code: r.reason, message: r.reason, requestId }));
    }
    return res.json(success({ statement: r.statement }, requestId));
  } catch (e) {
    next(e);
  }
});

router.post("/admin/finance/period-statements/:id/reject", ...periodStatementReaders, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as typeof req & { auth: AuthContext }).auth;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const body = z.object({ reason: z.string().min(3).max(2000) }).safeParse(req.body);
  if (!id.success || !body.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
  }
  try {
    const existing = await getPeriodStatement(id.data);
    if (!existing) {
      return next(new ApiError({ statusCode: 404, code: "not_found", message: "Not found", requestId }));
    }
    const scopeErr = periodStatementScopeError(auth, existing, requestId);
    if (scopeErr) return next(scopeErr);

    const r = await rejectPeriodStatement({
      statementId: id.data,
      userId: auth.user.id,
      reason: body.data.reason,
    });
    if (!r.ok) {
      const status = r.reason === "statement_locked" ? 409 : 400;
      return next(new ApiError({ statusCode: status, code: r.reason, message: r.reason, requestId }));
    }
    return res.json(success({ statement: r.statement }, requestId));
  } catch (e) {
    next(e);
  }
});

router.post("/admin/finance/period-statements/:id/lock", ...periodStatementDrafters, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as typeof req & { auth: AuthContext }).auth;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_id", message: "Invalid id", requestId }));
  }
  try {
    const r = await lockPeriodStatement({ statementId: id.data, userId: auth.user.id });
    if (!r.ok) {
      const status =
        r.reason === "not_approved" || r.reason === "cooperative_iban_missing" ? 400 : 404;
      return next(new ApiError({ statusCode: status, code: r.reason, message: r.reason, requestId }));
    }
    return res.json(success({ statement: r.statement }, requestId));
  } catch (e) {
    next(e);
  }
});

router.patch("/admin/finance/period-statements/:id/lines/:lineId", ...periodStatementDrafters, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const lineId = z.coerce.number().int().positive().safeParse(req.params.lineId);
  const body = z
    .object({
      operational_rial: z.number().min(0).optional(),
      community_rial: z.number().min(0).optional(),
      deductions_rial: z.number().min(0).optional(),
    })
    .safeParse(req.body);
  if (!id.success || !lineId.success || !body.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
  }
  try {
    const r = await updatePeriodStatementLine({
      statementId: id.data,
      lineId: lineId.data,
      ...body.data,
    });
    if (!r.ok) {
      return next(
        new ApiError({
          statusCode: r.httpStatus ?? 400,
          code: r.reason,
          message: r.reason,
          requestId,
        }),
      );
    }
    return res.json(success({ statement: r.statement }, requestId));
  } catch (e) {
    next(e);
  }
});

router.post(
  "/admin/finance/period-statements/:id/register-mine-payment",
  ...periodStatementDrafters,
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    const auth = (req as typeof req & { auth: AuthContext }).auth;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    const body = z.object({ payment_reference: paymentReferenceSchema }).safeParse(req.body ?? {});
    if (!id.success || !body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
    }
    try {
      const existing = await getPeriodStatement(id.data);
      if (!existing) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Not found", requestId }));
      }
      const scopeErr = periodStatementScopeError(auth, existing, requestId);
      if (scopeErr) return next(scopeErr);

      const r = await registerMinePayment({
        statementId: id.data,
        payment_reference: body.data.payment_reference,
        userId: auth.user.id,
      });
      if (!r.ok) {
        const status =
          r.reason === "not_locked" || r.reason === "already_paid" || r.reason === "invalid_payment_reference"
            ? 409
            : 404;
        return next(new ApiError({ statusCode: status, code: r.reason, message: r.reason, requestId }));
      }
      return res.json(success({ statement: r.statement }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/admin/finance/period-statements/:id/export-mine-payment",
  ...periodStatementReaders,
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    const auth = (req as typeof req & { auth: AuthContext }).auth;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_id", message: "Invalid id", requestId }));
    }
    try {
      const statement = await getPeriodStatement(id.data);
      if (!statement) {
        return next(new ApiError({ statusCode: 404, code: "not_found", message: "Not found", requestId }));
      }
      const scopeErr = periodStatementScopeError(auth, statement, requestId);
      if (scopeErr) return next(scopeErr);

      const rows = await settlementRepo.buildMinePaymentExportRows(id.data);
      if (rows.length === 0) {
        return next(
          new ApiError({
            statusCode: 409,
            code: "export_not_available",
            message: "Period statement must be LOCKED with cooperative IBAN",
            requestId,
          }),
        );
      }
      const csv = settlementRepo.exportRowsToCsv(rows, "mine");
      const filename = `mine-payment-statement-${id.data}.csv`;
      res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(csv);
    } catch (e) {
      next(e);
    }
  },
);

export const adminFinanceRouter = router;
