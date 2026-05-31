import type { PaymentPayoutStatus, SettlementBatchStatus, SettlementBatchType, UserRole } from "@prisma/client";
import { prisma } from "../db/prisma";
import { toBig, toNum } from "./id";
import { fromDecimal, toDecimal } from "./decimal";
import * as missionsRepo from "./missionsRepository";
import * as walletsRepo from "./walletsRepository";
import * as communityPoolsRepo from "./communityPoolsRepository";
import { ruleEngine } from "../services/ruleEngine";
import { publishEvent } from "../services/eventBus";
import { missionEligibleForSettlementWhere } from "../lib/settlementEligibility";
import {
  hasAllSettlementApprovals,
  SETTLEMENT_BATCH_APPROVAL_ROLES,
  type SettlementBatchApprovalRole,
} from "../lib/settlementGovernance";
import * as auditRepo from "./auditLogsRepository";
import {
  cancelPendingApprovalTasks,
  completeApprovalTaskForRole,
  createPendingApprovalTasks,
  isEntityApprovalOverdue,
} from "../lib/approvalTasks";
import { monthBoundsUtc, ownerPeriodBounds } from "../lib/settlementCycle";

export type SettlementBatchRow = {
  id: number;
  mine_id?: number;
  period_start: Date;
  period_end: Date;
  batch_type: SettlementBatchType;
  status: SettlementBatchStatus;
  created_by_user_id?: number;
  locked_at?: Date;
  sent_to_bank_at?: Date;
  paid_at?: Date;
  payment_reference?: string;
  receipt_file_url?: string;
  failure_reason?: string;
  created_at: Date;
  /** SLA-ESCALATION-1: pending approval past due_at (before lock). */
  approval_stale?: boolean;
};

export type SettlementLineRow = {
  id: number;
  batch_id: number;
  wallet_id: number;
  amount: number;
  mission_id?: number;
  hourly_work_log_id?: number;
  note?: string;
};

export type SettlementPayeeType =
  | "MINE_TO_COOP"
  | "INTERNAL_FLEET_OWNER"
  | "INTERNAL_HOUSEHOLD"
  | "INTERNAL_COMMUNITY";

export type SettlementExportRow = {
  payee_type: SettlementPayeeType;
  role: string;
  name: string;
  iban: string;
  amount: number;
  payment_reference: string;
  payer_label: string;
};

export type PaymentPayoutRow = {
  id: number;
  settlement_batch_id: number;
  settlement_line_id: number;
  status: PaymentPayoutStatus;
  bank_reference?: string;
};

function mapBatch(r: {
  id: bigint;
  mine_id: bigint | null;
  period_start: Date;
  period_end: Date;
  batch_type: SettlementBatchType;
  status: SettlementBatchStatus;
  created_by_user_id: bigint | null;
  locked_at: Date | null;
  sent_to_bank_at: Date | null;
  paid_at: Date | null;
  payment_reference: string | null;
  receipt_file_url: string | null;
  failure_reason: string | null;
  created_at: Date;
}): SettlementBatchRow {
  return {
    id: toNum(r.id),
    mine_id: r.mine_id != null ? toNum(r.mine_id) : undefined,
    period_start: r.period_start,
    period_end: r.period_end,
    batch_type: r.batch_type,
    status: r.status,
    created_by_user_id: r.created_by_user_id != null ? toNum(r.created_by_user_id) : undefined,
    locked_at: r.locked_at ?? undefined,
    sent_to_bank_at: r.sent_to_bank_at ?? undefined,
    paid_at: r.paid_at ?? undefined,
    payment_reference: r.payment_reference ?? undefined,
    receipt_file_url: r.receipt_file_url ?? undefined,
    failure_reason: r.failure_reason ?? undefined,
    created_at: r.created_at,
  };
}

function mapLine(r: {
  id: bigint;
  batch_id: bigint;
  wallet_id: bigint;
  amount: { toString(): string };
  mission_id: bigint | null;
  hourly_work_log_id: bigint | null;
  note: string | null;
}): SettlementLineRow {
  return {
    id: toNum(r.id),
    batch_id: toNum(r.batch_id),
    wallet_id: toNum(r.wallet_id),
    amount: fromDecimal(r.amount),
    mission_id: r.mission_id != null ? toNum(r.mission_id) : undefined,
    hourly_work_log_id: r.hourly_work_log_id != null ? toNum(r.hourly_work_log_id) : undefined,
    note: r.note ?? undefined,
  };
}

function monthBounds(year: number, month: number) {
  return monthBoundsUtc(year, month);
}

async function findExistingBatch(params: {
  mine_id: number;
  period_start: Date;
  batch_type: SettlementBatchType;
}) {
  return prisma.settlement_batches.findFirst({
    where: {
      mine_id: toBig(params.mine_id),
      period_start: params.period_start,
      batch_type: params.batch_type,
      status: { notIn: ["CANCELLED", "FAILED"] },
    },
  });
}

async function ownerCreditForMission(missionId: number): Promise<number> {
  const mission = await prisma.missions.findUnique({
    where: { id: toBig(missionId) },
    select: { owner_id: true },
  });
  if (!mission) return 0;
  const wallet = await walletsRepo.findWalletForOwner(toNum(mission.owner_id));
  if (!wallet) return 0;
  const txs = await prisma.transactions.findMany({
    where: {
      wallet_id: toBig(wallet.id),
      mission_id: toBig(missionId),
      type: "CREDIT",
    },
  });
  return txs.reduce((s, t) => s + fromDecimal(t.amount), 0);
}

async function ownerCreditForHourly(hourlyId: number): Promise<number> {
  const log = await prisma.hourly_work_logs.findUnique({
    where: { id: toBig(hourlyId) },
    select: { fleet_owner_id: true },
  });
  if (!log) return 0;
  const wallet = await walletsRepo.findWalletForOwner(toNum(log.fleet_owner_id));
  if (!wallet) return 0;
  const txs = await prisma.transactions.findMany({
    where: {
      wallet_id: toBig(wallet.id),
      type: "CREDIT",
      description: { contains: `HOURLY_CREDIT_OWNER#${hourlyId}` },
    },
  });
  return txs.reduce((s, t) => s + fromDecimal(t.amount), 0);
}

async function appendPoolDistributionLines(batchId: number, poolId: number): Promise<SettlementLineRow[]> {
  const txs = await prisma.transactions.findMany({
    where: { community_pool_id: toBig(poolId), type: "POOL_DISTRIBUTION" },
    orderBy: { id: "asc" },
  });
  const created: SettlementLineRow[] = [];
  for (const tx of txs) {
    const existing = await prisma.settlement_lines.findFirst({
      where: {
        batch_id: toBig(batchId),
        wallet_id: tx.wallet_id,
        note: "POOL_DISTRIBUTION",
      },
    });
    if (existing) {
      created.push(mapLine(existing));
      continue;
    }
    const line = await prisma.settlement_lines.create({
      data: {
        batch_id: toBig(batchId),
        wallet_id: tx.wallet_id,
        amount: tx.amount,
        note: "POOL_DISTRIBUTION",
      },
    });
    created.push(mapLine(line));
  }
  return created;
}

export async function listBatches(params?: { mine_id?: number }): Promise<SettlementBatchRow[]> {
  const rows = await prisma.settlement_batches.findMany({
    where: params?.mine_id != null ? { mine_id: toBig(params.mine_id) } : undefined,
    orderBy: { created_at: "desc" },
  });
  const batches = rows.map(mapBatch);
  return Promise.all(
    batches.map(async (b) => {
      if (b.status !== "CALCULATED" && b.status !== "DRAFT") {
        return b;
      }
      const approval_stale = await isEntityApprovalOverdue({
        entity_type: "settlement_batch",
        entity_id: b.id,
      });
      return { ...b, approval_stale };
    }),
  );
}

export async function getBatch(batchId: number): Promise<SettlementBatchRow | null> {
  const b = await prisma.settlement_batches.findUnique({ where: { id: toBig(batchId) } });
  return b ? mapBatch(b) : null;
}

export async function getLines(batchId: number): Promise<SettlementLineRow[]> {
  const rows = await prisma.settlement_lines.findMany({
    where: { batch_id: toBig(batchId) },
    orderBy: { id: "asc" },
  });
  return rows.map(mapLine);
}

export async function createDraft(params: {
  mine_id?: number;
  period_start: Date;
  period_end: Date;
  created_by_user_id?: number;
  lines: Array<{
    wallet_id: number;
    amount: number;
    mission_id?: number;
    hourly_work_log_id?: number;
    note?: string;
  }>;
}): Promise<{ batch: SettlementBatchRow; lines: SettlementLineRow[] }> {
  const batch = await prisma.settlement_batches.create({
    data: {
      mine_id: params.mine_id != null ? toBig(params.mine_id) : null,
      period_start: params.period_start,
      period_end: params.period_end,
      status: "DRAFT",
      created_by_user_id: params.created_by_user_id != null ? toBig(params.created_by_user_id) : null,
      lines: {
        create: params.lines.map((l) => ({
          wallet_id: toBig(l.wallet_id),
          amount: toDecimal(l.amount),
          mission_id: l.mission_id != null ? toBig(l.mission_id) : null,
          hourly_work_log_id: l.hourly_work_log_id != null ? toBig(l.hourly_work_log_id) : null,
          note: l.note,
        })),
      },
    },
    include: { lines: true },
  });
  return {
    batch: mapBatch(batch),
    lines: batch.lines.map(mapLine),
  };
}

/** SET-1: monthly-close — VERIFIED missions + APPROVED hourly → CALCULATED batch + distributePool */
export async function monthlyClose(params: {
  mine_id: number;
  year: number;
  month: number;
  created_by_user_id?: number;
}): Promise<
  | {
      ok: true;
      batch: SettlementBatchRow;
      lines: SettlementLineRow[];
      pool_distribution?: communityPoolsRepo.DistributePoolResult & { ok: true };
    }
  | { ok: false; reason: string }
> {
  const { periodStart, periodEnd } = monthBounds(params.year, params.month);

  const dup = await findExistingBatch({
    mine_id: params.mine_id,
    period_start: periodStart,
    batch_type: "COMBINED_LEGACY",
  });
  if (dup) return { ok: false, reason: "batch_exists_for_period" };

  const missions = await prisma.missions.findMany({
    where: {
      ...missionEligibleForSettlementWhere(),
      load: { mine_id: toBig(params.mine_id) },
      verified_at: { gte: periodStart, lte: periodEnd },
      settlement_lines: {
        none: {
          batch: { status: { notIn: ["CANCELLED", "FAILED"] } },
        },
      },
    },
    select: { id: true, owner_id: true },
  });

  const hourlyLogs = await prisma.hourly_work_logs.findMany({
    where: {
      mine_id: toBig(params.mine_id),
      status: "APPROVED",
      consultant_verified_at: { gte: periodStart, lte: periodEnd },
      settlement_lines: {
        none: {
          batch: { status: { notIn: ["CANCELLED", "FAILED"] } },
        },
      },
    },
    select: { id: true, fleet_owner_id: true },
  });

  const lineInputs: Array<{
    wallet_id: number;
    amount: number;
    mission_id?: number;
    hourly_work_log_id?: number;
    note?: string;
  }> = [];

  for (const m of missions) {
    const amount = await ownerCreditForMission(toNum(m.id));
    if (amount <= 0) continue;
    const wallet = await walletsRepo.findWalletForOwner(toNum(m.owner_id));
    if (!wallet) continue;
    lineInputs.push({
      wallet_id: wallet.id,
      amount,
      mission_id: toNum(m.id),
      note: "MISSION_OWNER",
    });
  }

  for (const h of hourlyLogs) {
    const amount = await ownerCreditForHourly(toNum(h.id));
    if (amount <= 0) continue;
    const wallet = await walletsRepo.findWalletForOwner(toNum(h.fleet_owner_id));
    if (!wallet) continue;
    lineInputs.push({
      wallet_id: wallet.id,
      amount,
      hourly_work_log_id: toNum(h.id),
      note: "HOURLY_OWNER",
    });
  }

  const batch = await prisma.settlement_batches.create({
    data: {
      mine_id: toBig(params.mine_id),
      period_start: periodStart,
      period_end: periodEnd,
      batch_type: "COMBINED_LEGACY",
      status: "CALCULATED",
      created_by_user_id: params.created_by_user_id != null ? toBig(params.created_by_user_id) : null,
      lines: {
        create: lineInputs.map((l) => ({
          wallet_id: toBig(l.wallet_id),
          amount: toDecimal(l.amount),
          mission_id: l.mission_id != null ? toBig(l.mission_id) : null,
          hourly_work_log_id: l.hourly_work_log_id != null ? toBig(l.hourly_work_log_id) : null,
          note: l.note,
        })),
      },
    },
    include: { lines: true },
  });

  let poolDist: (communityPoolsRepo.DistributePoolResult & { ok: true }) | undefined;
  const period_key = await ruleEngine.getPeriodKey(periodEnd, { mineId: params.mine_id });
  const pool = await communityPoolsRepo.findPoolByMinePeriod(params.mine_id, period_key);
  if (pool) {
    const dist = await communityPoolsRepo.distributePool(pool.id, periodEnd);
    if (dist.ok) {
      poolDist = dist;
      await appendPoolDistributionLines(toNum(batch.id), pool.id);
    }
  }

  await createPendingApprovalTasks({
    entity_type: "settlement_batch",
    entity_id: toNum(batch.id),
    required_roles: SETTLEMENT_BATCH_APPROVAL_ROLES,
  });

  const allLines = await getLines(toNum(batch.id));
  await publishEvent("settlement.calculated", {
    batch_id: toNum(batch.id),
    mine_id: params.mine_id,
    year: params.year,
    month: params.month,
    line_count: allLines.length,
  });

  return {
    ok: true,
    batch: mapBatch(batch),
    lines: allLines,
    pool_distribution: poolDist,
  };
}

/** SET-CYCLE-1: owner-only weekly batch — VERIFIED missions + APPROVED hourly in 7-day bucket. */
export async function ownerWeeklyClose(params: {
  mine_id: number;
  at?: Date;
  created_by_user_id?: number;
}): Promise<
  | { ok: true; batch: SettlementBatchRow; lines: SettlementLineRow[]; skipped?: false }
  | { ok: false; reason: string; skipped?: true }
> {
  const at = params.at ?? new Date();
  const periodDays = await ruleEngine.getOwnerPeriodDays({ mineId: params.mine_id, at });
  const { periodStart, periodEnd } = ownerPeriodBounds(at, periodDays);

  const dup = await findExistingBatch({
    mine_id: params.mine_id,
    period_start: periodStart,
    batch_type: "OWNER_WEEKLY",
  });
  if (dup) return { ok: false, reason: "batch_exists_for_period", skipped: true };

  const missions = await prisma.missions.findMany({
    where: {
      ...missionEligibleForSettlementWhere(),
      load: { mine_id: toBig(params.mine_id) },
      verified_at: { gte: periodStart, lte: periodEnd },
      settlement_lines: {
        none: {
          batch: { status: { notIn: ["CANCELLED", "FAILED"] }, batch_type: "OWNER_WEEKLY" },
        },
      },
    },
    select: { id: true, owner_id: true },
  });

  const hourlyLogs = await prisma.hourly_work_logs.findMany({
    where: {
      mine_id: toBig(params.mine_id),
      status: "APPROVED",
      consultant_verified_at: { gte: periodStart, lte: periodEnd },
      settlement_lines: {
        none: {
          batch: { status: { notIn: ["CANCELLED", "FAILED"] }, batch_type: "OWNER_WEEKLY" },
        },
      },
    },
    select: { id: true, fleet_owner_id: true },
  });

  const lineInputs: Array<{
    wallet_id: number;
    amount: number;
    mission_id?: number;
    hourly_work_log_id?: number;
    note?: string;
  }> = [];

  for (const m of missions) {
    const amount = await ownerCreditForMission(toNum(m.id));
    if (amount <= 0) continue;
    const wallet = await walletsRepo.findWalletForOwner(toNum(m.owner_id));
    if (!wallet) continue;
    lineInputs.push({
      wallet_id: wallet.id,
      amount,
      mission_id: toNum(m.id),
      note: "MISSION_OWNER",
    });
  }

  for (const h of hourlyLogs) {
    const amount = await ownerCreditForHourly(toNum(h.id));
    if (amount <= 0) continue;
    const wallet = await walletsRepo.findWalletForOwner(toNum(h.fleet_owner_id));
    if (!wallet) continue;
    lineInputs.push({
      wallet_id: wallet.id,
      amount,
      hourly_work_log_id: toNum(h.id),
      note: "HOURLY_OWNER",
    });
  }

  if (lineInputs.length === 0) {
    return { ok: false, reason: "no_owner_lines_for_period", skipped: true };
  }

  const batch = await prisma.settlement_batches.create({
    data: {
      mine_id: toBig(params.mine_id),
      period_start: periodStart,
      period_end: periodEnd,
      batch_type: "OWNER_WEEKLY",
      status: "CALCULATED",
      created_by_user_id: params.created_by_user_id != null ? toBig(params.created_by_user_id) : null,
      lines: {
        create: lineInputs.map((l) => ({
          wallet_id: toBig(l.wallet_id),
          amount: toDecimal(l.amount),
          mission_id: l.mission_id != null ? toBig(l.mission_id) : null,
          hourly_work_log_id: l.hourly_work_log_id != null ? toBig(l.hourly_work_log_id) : null,
          note: l.note,
        })),
      },
    },
    include: { lines: true },
  });

  await createPendingApprovalTasks({
    entity_type: "settlement_batch",
    entity_id: toNum(batch.id),
    required_roles: SETTLEMENT_BATCH_APPROVAL_ROLES,
  });

  const allLines = await getLines(toNum(batch.id));
  await publishEvent("settlement.calculated", {
    batch_id: toNum(batch.id),
    mine_id: params.mine_id,
    batch_type: "OWNER_WEEKLY",
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    line_count: allLines.length,
  });

  return { ok: true, batch: mapBatch(batch), lines: allLines };
}

/** SET-CYCLE-1: household-only monthly batch — distributePool + POOL_DISTRIBUTION lines. */
export async function householdMonthlyClose(params: {
  mine_id: number;
  year: number;
  month: number;
  created_by_user_id?: number;
}): Promise<
  | {
      ok: true;
      batch: SettlementBatchRow;
      lines: SettlementLineRow[];
      pool_distribution?: communityPoolsRepo.DistributePoolResult & { ok: true };
    }
  | { ok: false; reason: string; skipped?: true }
> {
  const { periodStart, periodEnd } = monthBounds(params.year, params.month);

  const dup = await findExistingBatch({
    mine_id: params.mine_id,
    period_start: periodStart,
    batch_type: "HOUSEHOLD_MONTHLY",
  });
  if (dup) return { ok: false, reason: "batch_exists_for_period", skipped: true };

  const period_key = await ruleEngine.getPeriodKey(periodEnd, { mineId: params.mine_id });
  const pool = await communityPoolsRepo.findPoolByMinePeriod(params.mine_id, period_key);
  if (!pool) return { ok: false, reason: "pool_not_found", skipped: true };

  let poolDist: (communityPoolsRepo.DistributePoolResult & { ok: true }) | undefined;
  if (pool.status !== "DISTRIBUTED") {
    const dist = await communityPoolsRepo.distributePool(pool.id, periodEnd);
    if (!dist.ok) return { ok: false, reason: dist.reason };
    poolDist = dist;
  }

  const batch = await prisma.settlement_batches.create({
    data: {
      mine_id: toBig(params.mine_id),
      period_start: periodStart,
      period_end: periodEnd,
      batch_type: "HOUSEHOLD_MONTHLY",
      status: "CALCULATED",
      created_by_user_id: params.created_by_user_id != null ? toBig(params.created_by_user_id) : null,
    },
  });

  const poolLines = await appendPoolDistributionLines(toNum(batch.id), pool.id);
  if (poolLines.length === 0) {
    await prisma.settlement_batches.delete({ where: { id: batch.id } });
    return { ok: false, reason: "no_household_lines_for_period", skipped: true };
  }

  await createPendingApprovalTasks({
    entity_type: "settlement_batch",
    entity_id: toNum(batch.id),
    required_roles: SETTLEMENT_BATCH_APPROVAL_ROLES,
  });

  const allLines = await getLines(toNum(batch.id));
  await publishEvent("settlement.calculated", {
    batch_id: toNum(batch.id),
    mine_id: params.mine_id,
    batch_type: "HOUSEHOLD_MONTHLY",
    year: params.year,
    month: params.month,
    line_count: allLines.length,
  });

  return {
    ok: true,
    batch: mapBatch(batch),
    lines: allLines,
    pool_distribution: poolDist,
  };
}

async function assertMinePaymentForBatch(batchId: number): Promise<string | null> {
  const statements = await prisma.period_statements.findMany({
    where: { settlement_batch_id: toBig(batchId), status: "LOCKED" },
    select: { id: true, mine_paid_at: true, period_key: true },
  });
  if (statements.length === 0) return null;
  const unpaid = statements.filter((s) => !s.mine_paid_at);
  if (unpaid.length > 0) return "mine_payment_required";
  return null;
}

export async function approveBatch(params: {
  batchId: number;
  userId: number;
  userRole: UserRole;
}): Promise<{ ok: true; batch: SettlementBatchRow } | { ok: false; reason: string }> {
  const role = params.userRole;
  if (!SETTLEMENT_BATCH_APPROVAL_ROLES.includes(role as SettlementBatchApprovalRole)) {
    return { ok: false, reason: "role_cannot_approve" };
  }

  const b = await prisma.settlement_batches.findUnique({
    where: { id: toBig(params.batchId) },
    include: { approvals: true },
  });
  if (!b) return { ok: false, reason: "batch_not_found" };
  if (b.status !== "CALCULATED" && b.status !== "DRAFT") {
    return { ok: false, reason: "invalid_batch_status" };
  }

  await completeApprovalTaskForRole({
    entity_type: "settlement_batch",
    entity_id: params.batchId,
    required_role: role,
  });

  await prisma.settlement_batch_approvals.upsert({
    where: {
      settlement_batch_id_approver_role: {
        settlement_batch_id: b.id,
        approver_role: role,
      },
    },
    create: {
      settlement_batch_id: b.id,
      approver_role: role,
      user_id: toBig(params.userId),
    },
    update: {
      user_id: toBig(params.userId),
      approved_at: new Date(),
    },
  });

  await auditRepo.insertAuditLog({
    entity_type: "settlement_batch",
    entity_id: String(params.batchId),
    action: "SETTLEMENT_BATCH_APPROVED",
    performed_by_user_id: params.userId,
    after_value: { approver_role: role },
  });

  const refreshed = await prisma.settlement_batches.findUnique({ where: { id: b.id } });
  return refreshed ? { ok: true, batch: mapBatch(refreshed) } : { ok: false, reason: "batch_not_found" };
}

/** Maker/checker: dual role approval; locker must not be a prior approver (same user). */
export async function lockBatch(
  batchId: number,
  lockedByUserId: number,
): Promise<{ ok: true; batch: SettlementBatchRow } | { ok: false; reason: string }> {
  const b = await prisma.settlement_batches.findUnique({
    where: { id: toBig(batchId) },
    include: { approvals: true },
  });
  if (!b) return { ok: false, reason: "batch_not_found" };
  if (b.status !== "CALCULATED" && b.status !== "DRAFT") return { ok: false, reason: "invalid_batch_status" };
  if (!hasAllSettlementApprovals(b.approvals)) {
    return { ok: false, reason: "dual_approval_required" };
  }
  if (b.approvals.some((a) => toNum(a.user_id) === lockedByUserId)) {
    return { ok: false, reason: "maker_checker_same_user" };
  }
  const mineGuard = await assertMinePaymentForBatch(batchId);
  if (mineGuard) return { ok: false, reason: mineGuard };
  const r = await prisma.settlement_batches.update({
    where: { id: toBig(batchId) },
    data: { status: "READY_FOR_SETTLEMENT", locked_at: new Date() },
  });

  await cancelPendingApprovalTasks({
    entity_type: "settlement_batch",
    entity_id: batchId,
  });

  await auditRepo.insertAuditLog({
    entity_type: "settlement_batch",
    entity_id: String(batchId),
    action: "SETTLEMENT_BATCH_LOCKED",
    performed_by_user_id: lockedByUserId,
    after_value: {
      status: "READY_FOR_SETTLEMENT",
      approval_roles: b.approvals.map((a) => a.approver_role),
    },
  });

  return { ok: true, batch: mapBatch(r) };
}

export async function sendToBank(batchId: number): Promise<{ ok: true; batch: SettlementBatchRow } | { ok: false; reason: string }> {
  const b = await prisma.settlement_batches.findUnique({ where: { id: toBig(batchId) } });
  if (!b || b.status !== "READY_FOR_SETTLEMENT") return { ok: false, reason: "invalid_batch_status" };
  const r = await prisma.settlement_batches.update({
    where: { id: toBig(batchId) },
    data: { status: "IN_BANK_QUEUE", sent_to_bank_at: new Date() },
  });
  await publishEvent("settlement.in_bank_queue", {
    batch_id: batchId,
    mine_id: b.mine_id != null ? toNum(b.mine_id) : null,
  });
  return { ok: true, batch: mapBatch(r) };
}

export async function markBatchPaid(
  batchId: number,
  payment_reference: string,
  receipt_file_url: string,
): Promise<{ ok: true; batch: SettlementBatchRow; payouts: PaymentPayoutRow[] } | { ok: false; reason: string }> {
  const b = await prisma.settlement_batches.findUnique({ where: { id: toBig(batchId) } });
  if (!b || b.status !== "IN_BANK_QUEUE") return { ok: false, reason: "invalid_batch_status" };

  const result = await prisma.$transaction(async (tx) => {
    const lines = await tx.settlement_lines.findMany({
      where: { batch_id: toBig(batchId) },
    });

    for (const line of lines) {
      if (line.mission_id != null) {
        const settled = await missionsRepo.settleVerifiedMission(toNum(line.mission_id), tx);
        if (!settled) throw new Error("mission_settle_failed");
      }
    }

    const updated = await tx.settlement_batches.update({
      where: { id: toBig(batchId) },
      data: {
        status: "SETTLED",
        paid_at: new Date(),
        payment_reference,
        receipt_file_url,
      },
    });

    await tx.payment_payouts.deleteMany({ where: { settlement_batch_id: toBig(batchId) } });

    const payouts: PaymentPayoutRow[] = [];
    for (const line of lines) {
      const payout = await tx.payment_payouts.create({
        data: {
          settlement_batch_id: toBig(batchId),
          settlement_line_id: line.id,
          status: "COMPLETED",
          completed_at: new Date(),
          bank_reference: payment_reference,
        },
      });
      payouts.push({
        id: toNum(payout.id),
        settlement_batch_id: batchId,
        settlement_line_id: toNum(line.id),
        status: payout.status,
        bank_reference: payout.bank_reference ?? undefined,
      });
    }

    const mission_ids = lines
      .map((line) => (line.mission_id != null ? toNum(line.mission_id) : null))
      .filter((id): id is number => id != null);

    return { batch: mapBatch(updated), payouts, mission_ids };
  });

  await publishEvent("settlement.settled", {
    batch_id: batchId,
    payment_reference,
    receipt_file_url,
    payout_count: result.payouts.length,
  });

  for (const mission_id of result.mission_ids) {
    await publishEvent("mission.settled", { mission_id, batch_id: batchId, payment_reference });
  }

  return { ok: true, batch: result.batch, payouts: result.payouts };
}

export async function markBatchFailed(
  batchId: number,
  reason: string,
  performedByUserId?: number,
): Promise<{ ok: true; batch: SettlementBatchRow } | { ok: false; reason: string }> {
  const b = await prisma.settlement_batches.findUnique({ where: { id: toBig(batchId) } });
  if (!b) return { ok: false, reason: "batch_not_found" };
  if (b.status !== "IN_BANK_QUEUE" && b.status !== "READY_FOR_SETTLEMENT") {
    return { ok: false, reason: "invalid_batch_status" };
  }

  const r = await prisma.settlement_batches.update({
    where: { id: toBig(batchId) },
    data: { status: "FAILED", failure_reason: reason },
  });

  await auditRepo.insertAuditLog({
    entity_type: "settlement_batch",
    entity_id: String(batchId),
    action: "OVERRIDE",
    performed_by_user_id: performedByUserId,
    reason,
    after_value: { status: "FAILED", manual_review: true },
  });

  await publishEvent("settlement.failed", {
    batch_id: batchId,
    reason,
    manual_review: true,
  });

  return { ok: true, batch: mapBatch(r) };
}

export async function buildExportRows(batchId: number): Promise<SettlementExportRow[]> {
  const batch = await prisma.settlement_batches.findUnique({ where: { id: toBig(batchId) } });
  if (!batch) return [];

  const lines = await prisma.settlement_lines.findMany({
    where: { batch_id: toBig(batchId) },
    include: {
      wallet: {
        include: {
          owner: true,
          household: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });

  const ref = batch.payment_reference ?? "";
  const metadata = (batch.metadata ?? {}) as { community_via_coop_account?: boolean };
  const communityViaCoop = metadata.community_via_coop_account === true;

  return lines.map((line) => {
    const w = line.wallet;
    if (line.note === "POOL_DISTRIBUTION" && w.wallet_type === "HOUSEHOLD" && w.household) {
      return {
        payee_type: "INTERNAL_COMMUNITY" as const,
        role: "Community Pool",
        name: w.household.head_name,
        iban: w.household.bank_iban ?? "",
        amount: fromDecimal(line.amount),
        payment_reference: ref,
        payer_label: communityViaCoop ? "حساب تعاونی (سپس distribute)" : "تعاونی/پلتفرم",
      };
    }
    if (w.wallet_type === "HOUSEHOLD" && w.household) {
      return {
        payee_type: "INTERNAL_HOUSEHOLD" as const,
        role: "خانوار",
        name: w.household.head_name,
        iban: w.household.bank_iban ?? "",
        amount: fromDecimal(line.amount),
        payment_reference: ref,
        payer_label: "تعاونی/پلتفرم",
      };
    }
    if (w.wallet_type === "OWNER" && w.owner) {
      return {
        payee_type: "INTERNAL_FLEET_OWNER" as const,
        role: "مالک ناوگان",
        name: w.owner.full_name,
        iban: w.owner.bank_iban ?? "",
        amount: fromDecimal(line.amount),
        payment_reference: ref,
        payer_label: "تعاونی/پلتفرم",
      };
    }
    return {
      payee_type: "INTERNAL_FLEET_OWNER" as const,
      role: w.wallet_type,
      name: "—",
      iban: "",
      amount: fromDecimal(line.amount),
      payment_reference: ref,
      payer_label: "تعاونی/پلتفرم",
    };
  });
}

/** SET-CYCLE-1: owner lines only — no household/pool mixing in export file. */
export async function buildOwnerExportRows(batchId: number): Promise<SettlementExportRow[]> {
  const rows = await buildExportRows(batchId);
  return rows.filter((r) => r.payee_type === "INTERNAL_FLEET_OWNER");
}

/** SET-CYCLE-1: household + community pool lines only. */
export async function buildHouseholdExportRows(batchId: number): Promise<SettlementExportRow[]> {
  const rows = await buildExportRows(batchId);
  return rows.filter((r) => r.payee_type === "INTERNAL_HOUSEHOLD" || r.payee_type === "INTERNAL_COMMUNITY");
}

export async function buildMinePaymentExportRows(statementId: number): Promise<SettlementExportRow[]> {
  const row = await prisma.period_statements.findUnique({
    where: { id: toBig(statementId) },
    include: { cooperative: { select: { name: true, iban: true } } },
  });
  if (!row || row.status !== "LOCKED" || !row.cooperative_payable_iban) return [];

  return [
    {
      payee_type: "MINE_TO_COOP",
      role: "حساب رسمی تعاونی",
      name: row.cooperative.name,
      iban: row.cooperative_payable_iban,
      amount: fromDecimal(row.payable_rial),
      payment_reference: row.mine_payment_reference ?? "",
      payer_label: "معدن",
    },
  ];
}

const CSV_GUIDE_OWNER = [
  "راهنمای اپراتور بانک — تسویه مالک ناوگان (هفتگی)",
  "payee_type: INTERNAL_FLEET_OWNER فقط",
  "خانوار و صندوق جامعه در فایل export-household.csv",
];

const CSV_GUIDE_HOUSEHOLD = [
  "راهنمای اپراتور بانک — تسویه خانوار / صندوق (ماهانه)",
  "payee_type: INTERNAL_HOUSEHOLD | INTERNAL_COMMUNITY",
  "مالک ناوگان در فایل export-owner.csv",
];

const CSV_GUIDE_INTERNAL = [
  "راهنمای اپراتور بانک — تسویه داخلی (لایه ۲)",
  "پرداخت‌کننده: تعاونی/پلتفرم — نه معدن",
  "payee_type: INTERNAL_FLEET_OWNER | INTERNAL_HOUSEHOLD | INTERNAL_COMMUNITY",
];

const CSV_GUIDE_MINE = [
  "راهنمای اپراتور بانک — پرداخت معدن (لایه ۱)",
  "فقط IBAN رسمی تعاونی — payee_type=MINE_TO_COOP",
  "معدن به مالک/خانوار مستقیم واریز نمی‌کند",
];

export function exportRowsToCsv(
  rows: SettlementExportRow[],
  kind: "internal" | "mine" | "owner" | "household" = "internal",
): string {
  const header = ["payee_type", "نقش", "نام", "IBAN", "مبلغ", "payment_reference", "payer"];
  const escape = (v: string | number) => {
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const guide =
    kind === "mine"
      ? CSV_GUIDE_MINE
      : kind === "owner"
        ? CSV_GUIDE_OWNER
        : kind === "household"
          ? CSV_GUIDE_HOUSEHOLD
          : CSV_GUIDE_INTERNAL;
  const body = rows.map((r) =>
    [r.payee_type, r.role, r.name, r.iban, r.amount, r.payment_reference, r.payer_label]
      .map(escape)
      .join(","),
  );
  return `\uFEFF${guide.map((g) => `# ${g}`).join("\n")}\n${header.join(",")}\n${body.join("\n")}\n`;
}

export async function getLineForReceipt(lineId: number) {
  return prisma.settlement_lines.findUnique({
    where: { id: toBig(lineId) },
    include: {
      batch: true,
      payment_payout: true,
      wallet: {
        include: {
          owner: true,
          household: true,
        },
      },
    },
  });
}

export async function updateLineReceiptUrl(lineId: number, receipt_file_url: string): Promise<void> {
  await prisma.settlement_lines.update({
    where: { id: toBig(lineId) },
    data: { receipt_file_url },
  });
}
