import { appContext } from "../../appContext";
import * as settlementRepo from "../../repositories/settlementRepository";
import * as communityPoolsRepo from "../../repositories/communityPoolsRepository";
import { createPeriodStatementDraftsForMinePeriod } from "../../services/periodStatementService";
import { executePayoutsForBatch, runDailySettlementCycle } from "../../services/settlementService";

export async function runMonthlyClose(payload: Record<string, unknown>) {
  const mine_id = Number(payload.mine_id ?? 1);
  const year = Number(payload.year);
  const month = Number(payload.month);
  const created_by_user_id =
    payload.created_by_user_id != null ? Number(payload.created_by_user_id) : undefined;
  if (!year || !month) throw new Error("year and month required");
  const r = await appContext.settlement.monthlyClose({ mine_id, year, month, created_by_user_id });
  if (!r.ok) throw new Error(r.reason);
  const period_statements = await createPeriodStatementDraftsForMinePeriod({
    mine_id,
    year,
    month,
    created_by_user_id,
    settlement_batch_id: r.batch.id,
  });
  return { ...r, period_statements };
}

export async function runDistributePool(payload: Record<string, unknown>) {
  const poolId = Number(payload.pool_id);
  if (!poolId) throw new Error("pool_id required");
  const at = payload.at ? new Date(String(payload.at)) : new Date();
  const r = await communityPoolsRepo.distributePool(poolId, at);
  if (!r.ok) throw new Error(r.reason);
  return r;
}

export async function runExportExcel(payload: Record<string, unknown>) {
  const batchId = Number(payload.batch_id);
  if (!batchId) throw new Error("batch_id required");
  const batch = await appContext.settlement.getBatch(batchId);
  if (!batch) throw new Error("batch_not_found");
  const rows = await settlementRepo.buildExportRows(batchId);
  const csv = settlementRepo.exportRowsToCsv(rows, "internal");
  return {
    batch_id: batchId,
    row_count: rows.length,
    csv,
    filename: `settlement-batch-${batchId}.csv`,
    content_type: "application/vnd.ms-excel; charset=utf-8",
  };
}

export async function runExecutePayouts(payload: Record<string, unknown>) {
  const batchId = Number(payload.batch_id);
  if (!batchId) throw new Error("batch_id required");
  return executePayoutsForBatch(batchId);
}

/** SET-CYCLE-1: daily 02:00 local (Asia/Tehran) — owner weekly + household monthly (day 1). */
export async function runDailyCycleCron(payload: Record<string, unknown>) {
  const at = payload.at ? new Date(String(payload.at)) : new Date();
  const mine_ids =
    Array.isArray(payload.mine_ids) && payload.mine_ids.length > 0
      ? payload.mine_ids.map((x) => Number(x))
      : undefined;
  return runDailySettlementCycle({ at, mine_ids });
}
