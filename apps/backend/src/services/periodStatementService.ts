import type { PeriodStatementStatus, TransactionType, UserRole } from "@prisma/client";

import { prisma } from "../db/prisma";
import { normalizeIban } from "../lib/iban";
import { appContext } from "../appContext";
import { fromDecimal, toDecimal } from "../repositories/decimal";
import { toBig, toNum } from "../repositories/id";
import * as walletsRepo from "../repositories/walletsRepository";
import * as cooperativesRepo from "../repositories/cooperativesRepository";
import {
  cancelPendingApprovalTasks,
  completeApprovalTaskForRole,
  createPendingApprovalTasks,
  getPendingTasksForEntity,
  isEntityApprovalOverdue,
} from "../lib/approvalTasks";

/** Required dual approval before lock (GOV-WORKFLOW / INVOICE-DRAFT). */
export const PERIOD_STATEMENT_APPROVAL_ROLES = ["COOP_ADMIN", "OPERATION_ADMIN"] as const;
export type PeriodStatementApprovalRole = (typeof PERIOD_STATEMENT_APPROVAL_ROLES)[number];

export type PeriodStatementLineRow = {
  id: number;
  mission_id: number;
  operational_rial: number;
  community_rial: number;
  verified_net_tons: number;
  load_tracking_code: string | null;
};

export type PeriodStatementApprovalRow = {
  approver_role: string;
  user_id: number;
  approved_at: string;
};

export type PeriodStatementRow = {
  id: number;
  mine_id: number;
  cooperative_id: number;
  period_key: string;
  status: PeriodStatementStatus;
  service_count: number;
  total_tons: number;
  operational_rial: number;
  community_rial: number;
  deductions_rial: number;
  payable_rial: number;
  cooperative_payable_iban: string | null;
  mine_payment_reference: string | null;
  mine_paid_at: string | null;
  rejection_reason: string | null;
  locked_at: string | null;
  locked_by_user_id: number | null;
  settlement_batch_id: number | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  lines: PeriodStatementLineRow[];
  approvals: PeriodStatementApprovalRow[];
  required_approval_roles: PeriodStatementApprovalRole[];
  mine_payable: boolean;
  mine_paid: boolean;
  /** SLA-ESCALATION-1: earliest pending approval due (when in review). */
  approval_due_at: string | null;
  /** True when now &gt; approval_due_at for any pending role task. */
  approval_overdue: boolean;
};

function monthBounds(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

export function periodKeyFromParts(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function missionOperationalRial(m: {
  transactions: Array<{ type: string; amount: { toString(): string }; wallet: { wallet_type: string } }>;
}): number {
  let owner = 0;
  let platform = 0;
  for (const t of m.transactions) {
    const amt = walletsRepo.transactionBalanceDelta(t.type as TransactionType, fromDecimal(t.amount));
    if (t.wallet.wallet_type === "OWNER") owner += amt;
    if (t.wallet.wallet_type === "PLATFORM") platform += amt;
  }
  return round2(owner + platform);
}

function mapLine(l: {
  id: bigint;
  mission_id: bigint;
  operational_rial: { toString(): string };
  community_rial: { toString(): string };
  verified_net_tons: { toString(): string } | null;
  load_tracking_code: string | null;
}): PeriodStatementLineRow {
  return {
    id: toNum(l.id),
    mission_id: toNum(l.mission_id),
    operational_rial: round2(fromDecimal(l.operational_rial)),
    community_rial: round2(fromDecimal(l.community_rial)),
    verified_net_tons:
      l.verified_net_tons != null ? round3(fromDecimal(l.verified_net_tons)) : 0,
    load_tracking_code: l.load_tracking_code,
  };
}

function mapStatement(row: {
  id: bigint;
  mine_id: bigint;
  cooperative_id: bigint;
  period_key: string;
  status: PeriodStatementStatus;
  service_count: number;
  total_tons: { toString(): string } | null;
  operational_rial: { toString(): string };
  community_rial: { toString(): string };
  deductions_rial: { toString(): string };
  payable_rial: { toString(): string };
  cooperative_payable_iban: string | null;
  mine_payment_reference: string | null;
  mine_paid_at: Date | null;
  rejection_reason: string | null;
  locked_at: Date | null;
  locked_by_user_id: bigint | null;
  settlement_batch_id: bigint | null;
  created_by_user_id: bigint | null;
  created_at: Date;
  updated_at: Date;
  lines: Array<Parameters<typeof mapLine>[0]>;
  approvals: Array<{ approver_role: string; user_id: bigint; approved_at: Date }>;
}): PeriodStatementRow {
  const iban = row.cooperative_payable_iban;
  return {
    id: toNum(row.id),
    mine_id: toNum(row.mine_id),
    cooperative_id: toNum(row.cooperative_id),
    period_key: row.period_key,
    status: row.status,
    service_count: row.service_count,
    total_tons: row.total_tons != null ? round3(fromDecimal(row.total_tons)) : 0,
    operational_rial: round2(fromDecimal(row.operational_rial)),
    community_rial: round2(fromDecimal(row.community_rial)),
    deductions_rial: round2(fromDecimal(row.deductions_rial)),
    payable_rial: round2(fromDecimal(row.payable_rial)),
    cooperative_payable_iban: iban,
    mine_payment_reference: row.mine_payment_reference,
    mine_paid_at: row.mine_paid_at?.toISOString() ?? null,
    rejection_reason: row.rejection_reason,
    locked_at: row.locked_at?.toISOString() ?? null,
    locked_by_user_id: row.locked_by_user_id != null ? toNum(row.locked_by_user_id) : null,
    settlement_batch_id: row.settlement_batch_id != null ? toNum(row.settlement_batch_id) : null,
    created_by_user_id: row.created_by_user_id != null ? toNum(row.created_by_user_id) : null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    lines: row.lines.map(mapLine),
    approvals: row.approvals.map((a) => ({
      approver_role: a.approver_role,
      user_id: toNum(a.user_id),
      approved_at: a.approved_at.toISOString(),
    })),
    required_approval_roles: [...PERIOD_STATEMENT_APPROVAL_ROLES],
    mine_payable: row.status === "LOCKED" && !!iban && !row.mine_paid_at,
    mine_paid: row.status === "LOCKED" && !!row.mine_paid_at,
    approval_due_at: null,
    approval_overdue: false,
  };
}

async function attachApprovalSla(statement: PeriodStatementRow): Promise<PeriodStatementRow> {
  if (statement.status !== "PENDING_REVIEW" && statement.status !== "APPROVED") {
    return statement;
  }
  const pending = await getPendingTasksForEntity({
    entity_type: "period_statement",
    entity_id: statement.id,
  });
  if (pending.length === 0) {
    const overdue = await isEntityApprovalOverdue({
      entity_type: "period_statement",
      entity_id: statement.id,
    });
    return { ...statement, approval_overdue: overdue };
  }
  const dueAt = pending[0]!.due_at;
  const overdue = pending.some((t) => new Date(t.due_at).getTime() < Date.now());
  return {
    ...statement,
    approval_due_at: dueAt,
    approval_overdue: overdue,
  };
}

async function loadStatement(id: number): Promise<PeriodStatementRow | null> {
  const row = await prisma.period_statements.findUnique({
    where: { id: toBig(id) },
    include: { lines: true, approvals: true },
  });
  if (!row) return null;
  return attachApprovalSla(mapStatement(row));
}

function recomputePayable(operational: number, community: number, deductions: number): number {
  return round2(Math.max(0, operational + community - deductions));
}

async function aggregateMissionLines(
  mineId: number,
  cooperativeId: number,
  start: Date,
  end: Date,
): Promise<{
  lines: Array<{
    mission_id: number;
    operational_rial: number;
    community_rial: number;
    verified_net_tons: number;
    load_tracking_code: string;
  }>;
  operational_rial: number;
  community_rial: number;
  total_tons: number;
}> {
  const missions = await prisma.missions.findMany({
    where: {
      status: "VERIFIED",
      verified_at: { gte: start, lt: end },
      load: { mine_id: toBig(mineId) },
      owner: { cooperative_id: toBig(cooperativeId) },
      period_statement_line: null,
    },
    include: {
      load: { select: { load_tracking_code: true } },
      transactions: { include: { wallet: { select: { wallet_type: true } } } },
    },
    orderBy: { verified_at: "asc" },
  });

  const lines = missions.map((m) => {
    const netKg = m.verified_net_tons_kg != null ? fromDecimal(m.verified_net_tons_kg) : 0;
    const community =
      m.community_contribution_rial != null
        ? round2(fromDecimal(m.community_contribution_rial))
        : 0;
    return {
      mission_id: toNum(m.id),
      operational_rial: missionOperationalRial(m),
      community_rial: community,
      verified_net_tons: round3(netKg / 1000),
      load_tracking_code: m.load.load_tracking_code,
    };
  });

  const operational_rial = round2(lines.reduce((s, l) => s + l.operational_rial, 0));
  const community_rial = round2(lines.reduce((s, l) => s + l.community_rial, 0));
  const total_tons = round3(lines.reduce((s, l) => s + l.verified_net_tons, 0));

  return { lines, operational_rial, community_rial, total_tons };
}

export async function createPeriodStatementDraft(params: {
  mine_id: number;
  cooperative_id: number;
  year: number;
  month: number;
  created_by_user_id?: number;
  deductions_rial?: number;
  settlement_batch_id?: number;
}): Promise<{ ok: true; statement: PeriodStatementRow } | { ok: false; reason: string }> {
  const period_key = periodKeyFromParts(params.year, params.month);
  const coop = await cooperativesRepo.findCooperativeById(params.cooperative_id);
  if (!coop || coop.mine_id !== params.mine_id) {
    return { ok: false, reason: "cooperative_not_in_mine" };
  }

  const existing = await prisma.period_statements.findUnique({
    where: {
      mine_id_cooperative_id_period_key: {
        mine_id: toBig(params.mine_id),
        cooperative_id: toBig(params.cooperative_id),
        period_key,
      },
    },
    include: { lines: true, approvals: true },
  });
  if (existing) {
    if (existing.status === "LOCKED") return { ok: false, reason: "statement_locked" };
    if (existing.status !== "DRAFT") {
      return { ok: false, reason: "statement_exists" };
    }
    return { ok: true, statement: mapStatement(existing) };
  }

  const { start, end } = monthBounds(params.year, params.month);
  const agg = await aggregateMissionLines(params.mine_id, params.cooperative_id, start, end);
  const deductions = params.deductions_rial ?? 0;
  const payable = recomputePayable(agg.operational_rial, agg.community_rial, deductions);

  const created = await prisma.period_statements.create({
    data: {
      mine_id: toBig(params.mine_id),
      cooperative_id: toBig(params.cooperative_id),
      period_key,
      status: "DRAFT",
      service_count: agg.lines.length,
      total_tons: agg.total_tons > 0 ? toDecimal(agg.total_tons) : null,
      operational_rial: toDecimal(agg.operational_rial),
      community_rial: toDecimal(agg.community_rial),
      deductions_rial: toDecimal(deductions),
      payable_rial: toDecimal(payable),
      settlement_batch_id:
        params.settlement_batch_id != null ? toBig(params.settlement_batch_id) : null,
      created_by_user_id:
        params.created_by_user_id != null ? toBig(params.created_by_user_id) : null,
      lines: {
        create: agg.lines.map((l) => ({
          mission_id: toBig(l.mission_id),
          operational_rial: toDecimal(l.operational_rial),
          community_rial: toDecimal(l.community_rial),
          verified_net_tons: toDecimal(l.verified_net_tons),
          load_tracking_code: l.load_tracking_code,
        })),
      },
    },
    include: { lines: true, approvals: true },
  });

  return { ok: true, statement: mapStatement(created) };
}

/** After settlement monthly-close: draft per cooperative (skip duplicates). */
export async function createPeriodStatementDraftsForMinePeriod(params: {
  mine_id: number;
  year: number;
  month: number;
  created_by_user_id?: number;
  settlement_batch_id?: number;
}): Promise<PeriodStatementRow[]> {
  const coops = await cooperativesRepo.listCooperativesByMine(params.mine_id);
  const out: PeriodStatementRow[] = [];
  for (const c of coops) {
    const r = await createPeriodStatementDraft({
      ...params,
      cooperative_id: c.id,
    });
    if (r.ok) out.push(r.statement);
  }
  return out;
}

export async function listPeriodStatements(filters: {
  mine_id?: number;
  cooperative_id?: number;
  period_key?: string;
}): Promise<PeriodStatementRow[]> {
  const rows = await prisma.period_statements.findMany({
    where: {
      ...(filters.mine_id != null ? { mine_id: toBig(filters.mine_id) } : {}),
      ...(filters.cooperative_id != null ? { cooperative_id: toBig(filters.cooperative_id) } : {}),
      ...(filters.period_key != null ? { period_key: filters.period_key } : {}),
    },
    include: { lines: true, approvals: true },
    orderBy: { created_at: "desc" },
  });
  const mapped = rows.map(mapStatement);
  return Promise.all(mapped.map(attachApprovalSla));
}

export async function submitPeriodStatementForReview(
  statementId: number,
  userId: number,
): Promise<{ ok: true; statement: PeriodStatementRow } | { ok: false; reason: string }> {
  const row = await prisma.period_statements.findUnique({ where: { id: toBig(statementId) } });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== "DRAFT") return { ok: false, reason: "invalid_status" };

  await prisma.period_statements.update({
    where: { id: toBig(statementId) },
    data: { status: "PENDING_REVIEW", rejection_reason: null },
  });

  await createPendingApprovalTasks({
    entity_type: "period_statement",
    entity_id: statementId,
    required_roles: PERIOD_STATEMENT_APPROVAL_ROLES,
  });

  await appContext.auditStore.record({
    entity_type: "period_statement",
    entity_id: String(statementId),
    action: "PERIOD_STATEMENT_SUBMITTED",
    performed_by_user_id: userId,
  });

  const statement = await loadStatement(statementId);
  return statement ? { ok: true, statement } : { ok: false, reason: "not_found" };
}

function hasAllApprovals(approvals: Array<{ approver_role: string }>): boolean {
  const roles = new Set(approvals.map((a) => a.approver_role));
  return PERIOD_STATEMENT_APPROVAL_ROLES.every((r) => roles.has(r));
}

export async function approvePeriodStatement(params: {
  statementId: number;
  userId: number;
  userRole: UserRole;
  cooperativeId?: number | null;
}): Promise<{ ok: true; statement: PeriodStatementRow } | { ok: false; reason: string }> {
  const role = params.userRole;
  if (!PERIOD_STATEMENT_APPROVAL_ROLES.includes(role as PeriodStatementApprovalRole)) {
    return { ok: false, reason: "role_cannot_approve" };
  }

  const row = await prisma.period_statements.findUnique({
    where: { id: toBig(params.statementId) },
    include: { approvals: true },
  });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== "PENDING_REVIEW" && row.status !== "APPROVED") {
    return { ok: false, reason: "invalid_status" };
  }
  if (role === "COOP_ADMIN") {
    if (params.cooperativeId == null || toNum(row.cooperative_id) !== params.cooperativeId) {
      return { ok: false, reason: "cooperative_scope" };
    }
  }

  await completeApprovalTaskForRole({
    entity_type: "period_statement",
    entity_id: params.statementId,
    required_role: role,
  });

  await prisma.period_statement_approvals.upsert({
    where: {
      period_statement_id_approver_role: {
        period_statement_id: row.id,
        approver_role: role,
      },
    },
    create: {
      period_statement_id: row.id,
      approver_role: role,
      user_id: toBig(params.userId),
    },
    update: {
      user_id: toBig(params.userId),
      approved_at: new Date(),
    },
  });

  const refreshed = await prisma.period_statements.findUnique({
    where: { id: row.id },
    include: { approvals: true },
  });
  if (!refreshed) return { ok: false, reason: "not_found" };

  let nextStatus: PeriodStatementStatus = refreshed.status;
  if (hasAllApprovals(refreshed.approvals)) {
    nextStatus = "APPROVED";
  }
  if (nextStatus !== refreshed.status) {
    await prisma.period_statements.update({
      where: { id: row.id },
      data: { status: nextStatus },
    });
  }

  await appContext.auditStore.record({
    entity_type: "period_statement",
    entity_id: String(params.statementId),
    action: "PERIOD_STATEMENT_APPROVED",
    performed_by_user_id: params.userId,
    after_value: { approver_role: role, status: nextStatus },
  });

  const statement = await loadStatement(params.statementId);
  return statement ? { ok: true, statement } : { ok: false, reason: "not_found" };
}

export async function rejectPeriodStatement(params: {
  statementId: number;
  userId: number;
  reason: string;
}): Promise<{ ok: true; statement: PeriodStatementRow } | { ok: false; reason: string }> {
  const row = await prisma.period_statements.findUnique({ where: { id: toBig(params.statementId) } });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status === "LOCKED") return { ok: false, reason: "statement_locked" };
  if (row.status !== "PENDING_REVIEW" && row.status !== "APPROVED") {
    return { ok: false, reason: "invalid_status" };
  }

  await prisma.period_statement_approvals.deleteMany({
    where: { period_statement_id: row.id },
  });
  await cancelPendingApprovalTasks({
    entity_type: "period_statement",
    entity_id: params.statementId,
  });
  await prisma.period_statements.update({
    where: { id: row.id },
    data: {
      status: "DRAFT",
      rejection_reason: params.reason,
    },
  });

  await appContext.auditStore.record({
    entity_type: "period_statement",
    entity_id: String(params.statementId),
    action: "PERIOD_STATEMENT_REJECTED",
    performed_by_user_id: params.userId,
    reason: params.reason,
  });

  const statement = await loadStatement(params.statementId);
  return statement ? { ok: true, statement } : { ok: false, reason: "not_found" };
}

export async function lockPeriodStatement(params: {
  statementId: number;
  userId: number;
}): Promise<{ ok: true; statement: PeriodStatementRow } | { ok: false; reason: string }> {
  const row = await prisma.period_statements.findUnique({
    where: { id: toBig(params.statementId) },
    include: {
      cooperative: { select: { iban: true, status: true } },
      approvals: true,
    },
  });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== "APPROVED") return { ok: false, reason: "not_approved" };
  if (!hasAllApprovals(row.approvals)) return { ok: false, reason: "dual_approval_required" };
  if (row.approvals.some((a) => toNum(a.user_id) === params.userId)) {
    return { ok: false, reason: "maker_checker_same_user" };
  }
  if (!row.cooperative.iban?.trim()) return { ok: false, reason: "cooperative_iban_missing" };

  const payableIban = normalizeIban(row.cooperative.iban);

  await prisma.period_statements.update({
    where: { id: row.id },
    data: {
      status: "LOCKED",
      cooperative_payable_iban: payableIban,
      locked_at: new Date(),
      locked_by_user_id: toBig(params.userId),
    },
  });

  await cancelPendingApprovalTasks({
    entity_type: "period_statement",
    entity_id: params.statementId,
  });

  await appContext.auditStore.record({
    entity_type: "period_statement",
    entity_id: String(params.statementId),
    action: "PERIOD_STATEMENT_LOCKED",
    performed_by_user_id: params.userId,
    after_value: { payable_iban_last4: payableIban.slice(-4) },
  });

  const statement = await loadStatement(params.statementId);
  return statement ? { ok: true, statement } : { ok: false, reason: "not_found" };
}

export async function updatePeriodStatementLine(params: {
  statementId: number;
  lineId: number;
  operational_rial?: number;
  community_rial?: number;
  deductions_rial?: number;
}): Promise<
  | { ok: true; statement: PeriodStatementRow }
  | { ok: false; reason: string; httpStatus?: number }
> {
  const row = await prisma.period_statements.findUnique({
    where: { id: toBig(params.statementId) },
    include: { lines: true },
  });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status === "LOCKED") return { ok: false, reason: "statement_locked", httpStatus: 409 };
  if (row.status !== "DRAFT") return { ok: false, reason: "not_editable", httpStatus: 409 };

  const line = row.lines.find((l) => toNum(l.id) === params.lineId);
  if (!line) return { ok: false, reason: "line_not_found" };

  await prisma.period_statement_lines.update({
    where: { id: line.id },
    data: {
      ...(params.operational_rial != null
        ? { operational_rial: toDecimal(params.operational_rial) }
        : {}),
      ...(params.community_rial != null ? { community_rial: toDecimal(params.community_rial) } : {}),
    },
  });

  const lines = await prisma.period_statement_lines.findMany({
    where: { period_statement_id: row.id },
  });
  const operational = round2(lines.reduce((s, l) => s + fromDecimal(l.operational_rial), 0));
  const community = round2(lines.reduce((s, l) => s + fromDecimal(l.community_rial), 0));
  const deductions =
    params.deductions_rial != null
      ? params.deductions_rial
      : round2(fromDecimal(row.deductions_rial));
  const payable = recomputePayable(operational, community, deductions);
  const totalTons = round3(
    lines.reduce((s, l) => s + (l.verified_net_tons != null ? fromDecimal(l.verified_net_tons) : 0), 0),
  );

  await prisma.period_statements.update({
    where: { id: row.id },
    data: {
      operational_rial: toDecimal(operational),
      community_rial: toDecimal(community),
      deductions_rial: toDecimal(deductions),
      payable_rial: toDecimal(payable),
      service_count: lines.length,
      total_tons: totalTons > 0 ? toDecimal(totalTons) : null,
    },
  });

  const statement = await loadStatement(params.statementId);
  return statement ? { ok: true, statement } : { ok: false, reason: "not_found" };
}

export async function registerMinePayment(params: {
  statementId: number;
  payment_reference: string;
  userId: number;
}): Promise<{ ok: true; statement: PeriodStatementRow } | { ok: false; reason: string }> {
  const ref = params.payment_reference.trim();
  if (ref.length < 8) return { ok: false, reason: "invalid_payment_reference" };

  const row = await prisma.period_statements.findUnique({ where: { id: toBig(params.statementId) } });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== "LOCKED") return { ok: false, reason: "not_locked" };
  if (row.mine_paid_at) return { ok: false, reason: "already_paid" };
  if (!row.cooperative_payable_iban?.trim()) return { ok: false, reason: "cooperative_iban_missing" };

  await prisma.period_statements.update({
    where: { id: row.id },
    data: {
      mine_payment_reference: ref,
      mine_paid_at: new Date(),
    },
  });

  await appContext.auditStore.record({
    entity_type: "period_statement",
    entity_id: String(params.statementId),
    action: "MINE_PAYMENT_REGISTERED",
    performed_by_user_id: params.userId,
    after_value: { payment_reference_last4: ref.slice(-4) },
  });

  const statement = await loadStatement(params.statementId);
  return statement ? { ok: true, statement } : { ok: false, reason: "not_found" };
}

export function getPeriodStatement(statementId: number) {
  return loadStatement(statementId);
}
