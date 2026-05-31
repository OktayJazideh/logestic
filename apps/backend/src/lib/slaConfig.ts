/** SLA-ESCALATION-1: default approval window before tasks are considered stale. */
const DEFAULT_HOURS = 72;

function parseSlaHours(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return DEFAULT_HOURS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_HOURS;
  return n;
}

/** Hours from submit until approval is overdue (env: DEFAULT_APPROVAL_SLA_HOURS, default 72). */
export const DEFAULT_APPROVAL_SLA_HOURS = parseSlaHours(process.env.DEFAULT_APPROVAL_SLA_HOURS);

/** Phase 2: nightly cron escalates PENDING tasks past due_at when true. MVP: false. */
export const ENABLE_SLA_ESCALATION =
  process.env.ENABLE_SLA_ESCALATION === "true" || process.env.ENABLE_SLA_ESCALATION === "1";

export function computeApprovalDueAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + DEFAULT_APPROVAL_SLA_HOURS * 60 * 60 * 1000);
}

export function isPastDue(dueAt: Date | null | undefined, now: Date = new Date()): boolean {
  return dueAt != null && dueAt.getTime() < now.getTime();
}
