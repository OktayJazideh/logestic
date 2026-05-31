import { reconciliationService } from "../../services/reconciliationService";
import * as reconciliationRepo from "../../repositories/reconciliationRepository";

export type ReconciliationIssue = {
  code: string;
  entity_type: string;
  entity_id: string;
  message: string;
  details?: Record<string, unknown>;
};

/** RECON-1: nightly wallet ↔ ledger ↔ bank reconciliation; persists to reconciliation_issues. */
export async function runNightlyReconciliation(_payload: Record<string, unknown>) {
  const result = await reconciliationService.runReconciliation();
  return {
    run_id: result.run_id,
    issue_count: result.issue_count,
    issues: result.issues,
  };
}

export async function getLastReconciliationIssues(): Promise<ReconciliationIssue[]> {
  const rows = await reconciliationRepo.listIssues({ limit: 100 });
  if (rows.length === 0) return [];
  const latestRunId = rows[0]!.run_id;
  return rows
    .filter((r) => r.run_id === latestRunId)
    .map((r) => ({
      code: r.code,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      message: r.message,
      details: r.details,
    }));
}

export async function clearReconciliationIssuesForTests() {
  await reconciliationRepo.deleteAllIssuesForTests();
}
