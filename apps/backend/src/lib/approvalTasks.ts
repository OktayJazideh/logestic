/**
 * GOV-WORKFLOW-1 / SLA-ESCALATION-1: approval_tasks for SLA / role inbox.
 *
 * Phase 2 (ENABLE_SLA_ESCALATION): nightly cron in appInit escalates PENDING past due_at
 * → status ESCALATED, escalated_to_role, audit + notification job.
 * Chain: COOP_ADMIN → OPERATION_ADMIN → ADMIN
 */

export type ApprovalTaskEntityType = "period_statement" | "settlement_batch";

export {
  createPendingApprovalTasks,
  completeApprovalTaskForRole,
  cancelPendingApprovalTasks,
  getPendingTasksForEntity,
  isEntityApprovalOverdue,
  listStaleApprovalTasks,
  type ApprovalTaskRow,
} from "../repositories/approvalTasksRepository";
