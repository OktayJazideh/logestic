import { prisma } from "../db/prisma";
import * as walletsRepo from "../repositories/walletsRepository";
import * as reconciliationRepo from "../repositories/reconciliationRepository";
import type { NewReconciliationIssue } from "../repositories/reconciliationRepository";
import { fromDecimal } from "../repositories/decimal";
import { toNum } from "../repositories/id";

const TOLERANCE = 0.01;

export type ReconciliationRunResult = {
  run_id: string;
  issue_count: number;
  issues: NewReconciliationIssue[];
};

function newRunId(): string {
  return `recon-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Wallet balance (sum of signed tx deltas) must match ledger sum for every wallet. */
async function checkWalletLedgerMismatches(): Promise<NewReconciliationIssue[]> {
  const issues: NewReconciliationIssue[] = [];
  const wallets = await prisma.wallets.findMany({
    select: { id: true, owner_id: true, household_id: true, wallet_type: true },
  });

  for (const w of wallets) {
    const walletId = toNum(w.id);
    const balance = await walletsRepo.getWalletBalance(walletId);
    const ledgerSum = await walletsRepo.computeWalletLedgerSum(walletId);
    const diff = Math.abs(balance - ledgerSum);
    if (diff > TOLERANCE) {
      issues.push({
        code: "wallet_ledger_mismatch",
        entity_type: "wallet",
        entity_id: String(walletId),
        message: `balance ${balance.toFixed(2)} != ledger ${ledgerSum.toFixed(2)}`,
        details: {
          balance,
          ledger_sum: ledgerSum,
          owner_id: w.owner_id != null ? toNum(w.owner_id) : null,
          household_id: w.household_id != null ? toNum(w.household_id) : null,
          wallet_type: w.wallet_type,
        },
      });
    }
  }
  return issues;
}

/**
 * For SETTLED batches: sum of settlement_lines must equal sum of lines with COMPLETED payouts
 * (bank-settled payouts per RECON-1 spec; payout status COMPLETED = settled).
 */
async function checkSettlementPayoutMismatches(): Promise<NewReconciliationIssue[]> {
  const issues: NewReconciliationIssue[] = [];
  const batches = await prisma.settlement_batches.findMany({
    where: { status: "SETTLED" },
    select: { id: true },
  });

  for (const b of batches) {
    const batchId = toNum(b.id);
    const lines = await prisma.settlement_lines.findMany({
      where: { batch_id: b.id },
      select: { id: true, amount: true },
    });
    const lineSum = lines.reduce((s, l) => s + fromDecimal(l.amount), 0);

    const completedPayouts = await prisma.payment_payouts.findMany({
      where: { settlement_batch_id: b.id, status: "COMPLETED" },
      select: { settlement_line_id: true },
    });
    const completedLineIds = new Set(completedPayouts.map((p) => String(p.settlement_line_id)));
    const settledLineSum = lines
      .filter((l) => completedLineIds.has(String(l.id)))
      .reduce((s, l) => s + fromDecimal(l.amount), 0);

    const payoutSumMismatch = Math.abs(lineSum - settledLineSum) > TOLERANCE;
    const countMismatch = completedPayouts.length !== lines.length;

    if (payoutSumMismatch || countMismatch) {
      issues.push({
        code: "settlement_payout_mismatch",
        entity_type: "settlement_batch",
        entity_id: String(batchId),
        message: `batch ${batchId}: lines sum ${lineSum.toFixed(2)} vs settled payouts ${settledLineSum.toFixed(2)} (${completedPayouts.length}/${lines.length} lines)`,
        details: {
          line_sum: lineSum,
          settled_line_sum: settledLineSum,
          line_count: lines.length,
          completed_payout_count: completedPayouts.length,
        },
      });
    }
  }
  return issues;
}

/** Every POOL_DISTRIBUTION transaction must reference a DISTRIBUTED community pool. */
async function checkPoolDistributionLinks(): Promise<NewReconciliationIssue[]> {
  const issues: NewReconciliationIssue[] = [];
  const poolTxs = await prisma.transactions.findMany({
    where: { type: "POOL_DISTRIBUTION" },
    select: { id: true, community_pool_id: true, wallet_id: true },
  });

  for (const tx of poolTxs) {
    const txId = toNum(tx.id);
    if (tx.community_pool_id == null) {
      issues.push({
        code: "pool_distribution_missing_pool",
        entity_type: "transaction",
        entity_id: String(txId),
        message: `POOL_DISTRIBUTION tx ${txId} has no community_pool_id`,
        details: { wallet_id: toNum(tx.wallet_id) },
      });
      continue;
    }

    const pool = await prisma.community_pools.findUnique({
      where: { id: tx.community_pool_id },
      select: { id: true, status: true, period_key: true },
    });

    if (!pool) {
      issues.push({
        code: "pool_distribution_orphan",
        entity_type: "transaction",
        entity_id: String(txId),
        message: `POOL_DISTRIBUTION tx ${txId} references missing pool ${tx.community_pool_id}`,
        details: { community_pool_id: toNum(tx.community_pool_id) },
      });
      continue;
    }

    if (pool.status !== "DISTRIBUTED") {
      issues.push({
        code: "pool_not_distributed",
        entity_type: "transaction",
        entity_id: String(txId),
        message: `POOL_DISTRIBUTION tx ${txId} linked to pool ${toNum(pool.id)} with status ${pool.status}`,
        details: {
          community_pool_id: toNum(pool.id),
          pool_status: pool.status,
          period_key: pool.period_key,
        },
      });
    }
  }
  return issues;
}

export async function runReconciliation(): Promise<ReconciliationRunResult> {
  const runId = newRunId();
  const issues: NewReconciliationIssue[] = [
    ...(await checkWalletLedgerMismatches()),
    ...(await checkSettlementPayoutMismatches()),
    ...(await checkPoolDistributionLinks()),
  ];

  await reconciliationRepo.insertIssues(runId, issues);

  return { run_id: runId, issue_count: issues.length, issues };
}

export const reconciliationService = {
  runReconciliation,
  listIssues: reconciliationRepo.listIssues,
  resolveIssue: reconciliationRepo.resolveIssue,
  findIssueById: reconciliationRepo.findIssueById,
};
