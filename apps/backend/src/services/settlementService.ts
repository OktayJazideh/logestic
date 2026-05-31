/**
 * BANK-AUTO-1 — orchestrate auto bank payouts after settlement batch lock.
 * SET-CYCLE-1 — dual settlement cycles (owner weekly / household monthly).
 */
import type { PaymentPayoutStatus, SettlementBatchStatus } from "@prisma/client";
import { prisma } from "../db/prisma";
import { createBankAdapter, isBankAutoEnabled } from "../lib/bankAdapter";
import { publishEvent } from "./eventBus";
import { toBig, toNum } from "../repositories/id";
import { fromDecimal } from "../repositories/decimal";
import * as settlementRepo from "../repositories/settlementRepository";
import * as missionsRepo from "../repositories/missionsRepository";
import * as auditRepo from "../repositories/auditLogsRepository";
import { jobQueue } from "../queues/jobQueue";
import { isFirstDayOfMonth, localDateParts, SETTLEMENT_CRON_TZ } from "../lib/settlementCycle";

export type PayoutLineResult = {
  settlement_line_id: number;
  status: PaymentPayoutStatus;
  bank_reference?: string;
  failure_reason?: string;
};

export type ExecutePayoutsResult = {
  batch_id: number;
  batch_status: SettlementBatchStatus;
  lines: PayoutLineResult[];
  completed_count: number;
  failed_count: number;
  skipped_count: number;
};

const INTERNAL_PAYEE_TYPES = new Set([
  "INTERNAL_FLEET_OWNER",
  "INTERNAL_HOUSEHOLD",
  "INTERNAL_COMMUNITY",
]);

function payoutReference(batchId: number, lineId: number): string {
  return `PAYOUT-${batchId}-${lineId}`;
}

export async function enqueueBankPayoutsAfterLock(
  batchId: number,
  correlationId?: string,
): Promise<{ job_id: string } | null> {
  if (!isBankAutoEnabled()) return null;
  const job = await jobQueue.enqueue(
    "settlement",
    "execute-payouts",
    { batch_id: batchId },
    { correlation_id: correlationId, wait: false },
  );
  return { job_id: job.id };
}

/** Per-line payout via BankAdapter — idempotent per settlement_line_id. */
export async function executePayoutsForBatch(batchId: number): Promise<ExecutePayoutsResult> {
  const adapter = createBankAdapter();
  if (!adapter) {
    throw new Error("bank_adapter_disabled");
  }

  const batch = await prisma.settlement_batches.findUnique({ where: { id: toBig(batchId) } });
  if (!batch) throw new Error("batch_not_found");

  if (batch.status !== "READY_FOR_SETTLEMENT" && batch.status !== "IN_BANK_QUEUE") {
    throw new Error("invalid_batch_status");
  }
  if (!batch.locked_at) {
    throw new Error("batch_not_locked");
  }

  if (batch.status === "READY_FOR_SETTLEMENT") {
    const sent = await settlementRepo.sendToBank(batchId);
    if (!sent.ok) throw new Error(sent.reason);
  }

  const lines = await prisma.settlement_lines.findMany({
    where: { batch_id: toBig(batchId) },
    orderBy: { id: "asc" },
  });
  const exportRows = await settlementRepo.buildExportRows(batchId);
  const exportByLineId = new Map<number, settlementRepo.SettlementExportRow>();
  for (let i = 0; i < lines.length; i++) {
    const row = exportRows[i];
    if (row) exportByLineId.set(toNum(lines[i]!.id), row);
  }

  const results: PayoutLineResult[] = [];
  let completedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const line of lines) {
    const lineId = toNum(line.id);
    const existing = await prisma.payment_payouts.findUnique({
      where: { settlement_line_id: line.id },
    });

    if (existing?.status === "COMPLETED") {
      results.push({
        settlement_line_id: lineId,
        status: "COMPLETED",
        bank_reference: existing.bank_reference ?? undefined,
      });
      completedCount++;
      skippedCount++;
      continue;
    }
    if (existing?.status === "FAILED") {
      results.push({
        settlement_line_id: lineId,
        status: "FAILED",
        bank_reference: existing.bank_reference ?? undefined,
        failure_reason: existing.failure_reason ?? undefined,
      });
      failedCount++;
      skippedCount++;
      continue;
    }

    const exportRow = exportByLineId.get(lineId);
    if (!exportRow || !INTERNAL_PAYEE_TYPES.has(exportRow.payee_type)) {
      continue;
    }
    if (!exportRow.iban?.trim()) {
      skippedCount++;
      continue;
    }

    const reference = payoutReference(batchId, lineId);
    const amountRial = Math.round(fromDecimal(line.amount));

    let payoutId: bigint;
    if (existing) {
      await prisma.payment_payouts.update({
        where: { id: existing.id },
        data: { status: "PROCESSING", initiated_at: new Date() },
      });
      payoutId = existing.id;
    } else {
      const created = await prisma.payment_payouts.create({
        data: {
          settlement_batch_id: toBig(batchId),
          settlement_line_id: line.id,
          status: "PROCESSING",
          initiated_at: new Date(),
        },
      });
      payoutId = created.id;
    }

    const bankResult = await adapter.initiatePayout({
      iban: exportRow.iban,
      amount_rial: amountRial,
      reference,
      payee_name: exportRow.name,
    });

    if (bankResult.status === "ACCEPTED") {
      await prisma.$transaction(async (tx) => {
        await tx.payment_payouts.update({
          where: { id: payoutId },
          data: {
            status: "COMPLETED",
            completed_at: new Date(),
            bank_reference: bankResult.bank_ref,
            failure_reason: null,
          },
        });
        if (line.mission_id != null) {
          const settled = await missionsRepo.settleVerifiedMission(toNum(line.mission_id), tx);
          if (!settled) throw new Error("mission_settle_failed");
        }
      });

      await publishEvent("payout.completed", {
        batch_id: batchId,
        settlement_line_id: lineId,
        bank_reference: bankResult.bank_ref,
        amount_rial: amountRial,
        payee_type: exportRow.payee_type,
      });

      results.push({
        settlement_line_id: lineId,
        status: "COMPLETED",
        bank_reference: bankResult.bank_ref,
      });
      completedCount++;
    } else {
      const failureReason = "bank_rejected";
      await prisma.payment_payouts.update({
        where: { id: payoutId },
        data: {
          status: "FAILED",
          completed_at: new Date(),
          bank_reference: bankResult.bank_ref || null,
          failure_reason: failureReason,
        },
      });

      await publishEvent("payout.failed", {
        batch_id: batchId,
        settlement_line_id: lineId,
        bank_reference: bankResult.bank_ref,
        failure_reason: failureReason,
        amount_rial: amountRial,
        payee_type: exportRow.payee_type,
      });

      results.push({
        settlement_line_id: lineId,
        status: "FAILED",
        bank_reference: bankResult.bank_ref,
        failure_reason: failureReason,
      });
      failedCount++;
    }
  }

  const internalLineCount = lines.filter((l) => {
    const row = exportByLineId.get(toNum(l.id));
    return row && INTERNAL_PAYEE_TYPES.has(row.payee_type) && !!row.iban?.trim();
  }).length;

  let batchStatus: SettlementBatchStatus = batch.status;
  if (failedCount > 0) {
    batchStatus = "MANUAL_REVIEW";
    await prisma.settlement_batches.update({
      where: { id: toBig(batchId) },
      data: {
        status: "MANUAL_REVIEW",
        failure_reason: `partial_payout_failure:${failedCount}/${internalLineCount}`,
      },
    });
    await auditRepo.insertAuditLog({
      entity_type: "settlement_batch",
      entity_id: String(batchId),
      action: "OVERRIDE",
      after_value: { status: "MANUAL_REVIEW", failed_count: failedCount, manual_review: true },
    });
  } else if (completedCount >= internalLineCount && internalLineCount > 0) {
    const primaryRef = results.find((r) => r.status === "COMPLETED")?.bank_reference ?? `AUTO-${batchId}`;
    batchStatus = "SETTLED";
    await prisma.settlement_batches.update({
      where: { id: toBig(batchId) },
      data: {
        status: "SETTLED",
        paid_at: new Date(),
        payment_reference: primaryRef,
        receipt_file_url: `bank-auto://${batchId}`,
      },
    });
    await publishEvent("settlement.settled", {
      batch_id: batchId,
      payment_reference: primaryRef,
      receipt_file_url: `bank-auto://${batchId}`,
      payout_count: completedCount,
      auto: true,
    });
    for (const line of lines) {
      if (line.mission_id != null) {
        await publishEvent("mission.settled", {
          mission_id: toNum(line.mission_id),
          batch_id: batchId,
          payment_reference: primaryRef,
        });
      }
    }
  }

  return {
    batch_id: batchId,
    batch_status: batchStatus,
    lines: results,
    completed_count: completedCount,
    failed_count: failedCount,
    skipped_count: skippedCount,
  };
}

export type DailyCycleMineResult = {
  mine_id: number;
  owner_weekly?: settlementRepo.SettlementBatchRow;
  household_monthly?: settlementRepo.SettlementBatchRow;
  skipped?: string[];
};

export type DailyCycleResult = {
  at: string;
  timezone: string;
  mines: DailyCycleMineResult[];
};

/** SET-CYCLE-1: daily 02:00 cron — owner weekly every run (idempotent); household on day 1 of month. */
export async function runDailySettlementCycle(params?: {
  at?: Date;
  mine_ids?: number[];
}): Promise<DailyCycleResult> {
  const at = params?.at ?? new Date();
  const mineRows =
    params?.mine_ids != null && params.mine_ids.length > 0
      ? params.mine_ids.map((id) => ({ id: BigInt(id) }))
      : await prisma.mines.findMany({ select: { id: true } });

  const local = localDateParts(at);
  const runHousehold = isFirstDayOfMonth(at);
  let prevYear = local.year;
  let prevMonth = local.month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }

  const mines: DailyCycleMineResult[] = [];

  for (const row of mineRows) {
    const mine_id = toNum(row.id);
    const entry: DailyCycleMineResult = { mine_id, skipped: [] };

    const owner = await settlementRepo.ownerWeeklyClose({ mine_id, at });
    if (owner.ok) {
      entry.owner_weekly = owner.batch;
    } else if (owner.skipped) {
      entry.skipped!.push(`owner:${owner.reason}`);
    }

    if (runHousehold) {
      const household = await settlementRepo.householdMonthlyClose({
        mine_id,
        year: prevYear,
        month: prevMonth,
      });
      if (household.ok) {
        entry.household_monthly = household.batch;
      } else if (household.skipped) {
        entry.skipped!.push(`household:${household.reason}`);
      }
    }

    mines.push(entry);
  }

  return {
    at: at.toISOString(),
    timezone: SETTLEMENT_CRON_TZ,
    mines,
  };
}

export async function buildOwnerExportRows(batchId: number) {
  return settlementRepo.buildOwnerExportRows(batchId);
}

export async function buildHouseholdExportRows(batchId: number) {
  return settlementRepo.buildHouseholdExportRows(batchId);
}

export function exportOwnerRowsToCsv(rows: settlementRepo.SettlementExportRow[]) {
  return settlementRepo.exportRowsToCsv(rows, "owner");
}

export function exportHouseholdRowsToCsv(rows: settlementRepo.SettlementExportRow[]) {
  return settlementRepo.exportRowsToCsv(rows, "household");
}
