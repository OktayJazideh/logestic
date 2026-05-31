/** GOV-WORKFLOW-1: dual approval roles before settlement lock. */
export const SETTLEMENT_BATCH_APPROVAL_ROLES = ["COOP_ADMIN", "OPERATION_ADMIN"] as const;
export type SettlementBatchApprovalRole = (typeof SETTLEMENT_BATCH_APPROVAL_ROLES)[number];

export function hasAllSettlementApprovals(approvals: Array<{ approver_role: string }>): boolean {
  const roles = new Set(approvals.map((a) => a.approver_role));
  return SETTLEMENT_BATCH_APPROVAL_ROLES.every((r) => roles.has(r));
}
