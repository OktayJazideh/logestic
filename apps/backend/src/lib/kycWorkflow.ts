import type { ApprovalStatus, HouseholdStatus } from "@prisma/client";
import { appContext } from "../appContext";
import type { AuthContext } from "../middleware/authMiddleware";
import { hasPermission } from "../types/permissions";
import { isCoopScopedRole, normalizeRole, type UserRole } from "../types/userRole";

export const KYC_AUDIT_ACTION = "kyc_change";
export const KYC_RESUBMIT_ACTION = "kyc_resubmitted";
export const KYC_HOUSEHOLD_APPROVAL_ACTION = "kyc_household_approval";

export const DEFAULT_HOUSEHOLD_APPROVAL_QUORUM = 1;

export type KycEntityKind = "household" | "driver" | "fleet_owner" | "vehicle";

type KycOwnedEntity = {
  cooperative_id?: number;
  user_id?: number;
  owner_id?: number;
  status: ApprovalStatus | HouseholdStatus;
};

export function hasKycReviewPermission(role: string): boolean {
  return hasPermission(role as Parameters<typeof hasPermission>[0], "kyc:approve")
    || hasPermission(role as Parameters<typeof hasPermission>[0], "kyc:review");
}

export function assertCoopEntityScope(
  auth: AuthContext,
  cooperativeId: number | undefined,
): { ok: true } | { ok: false; message: string } {
  const normalized = normalizeRole(auth.user.role);
  if (normalized === "ADMIN") return { ok: true };
  if (!isCoopScopedRole(auth.user.role)) {
    return { ok: false, message: "Cooperative scope required" };
  }
  const coopId = auth.scope?.cooperativeId;
  if (!coopId || cooperativeId !== coopId) {
    return { ok: false, message: "Entity outside cooperative scope" };
  }
  return { ok: true };
}

export async function recordKycAudit(params: {
  entity_type: KycEntityKind;
  entity_id: number;
  before: unknown;
  after: unknown;
  performed_by_user_id: number;
  reason?: string;
  action?: string;
}) {
  await appContext.auditStore.record({
    entity_type: params.entity_type,
    entity_id: String(params.entity_id),
    action: params.action ?? KYC_AUDIT_ACTION,
    before_value: params.before,
    after_value: params.after,
    performed_by_user_id: params.performed_by_user_id,
    reason: params.reason,
  });
}

export async function recordKycResubmitAudit(params: {
  entity_type: KycEntityKind;
  entity_id: number;
  before: unknown;
  after: unknown;
  performed_by_user_id: number;
}) {
  await recordKycAudit({ ...params, action: KYC_RESUBMIT_ACTION });
}

export function isCoopKycStaff(role: UserRole | string): boolean {
  const n = normalizeRole(role as UserRole);
  return n === "COOP_ADMIN" || n === "COOP_OPERATOR";
}

export function assertCanResubmit(
  auth: AuthContext,
  entity: KycOwnedEntity,
  opts: { applicantUserId?: number; vehicleOwnerUserId?: number },
): { ok: true } | { ok: false; message: string } {
  const role = normalizeRole(auth.user.role);
  if (role === "ADMIN") return { ok: true };
  if (isCoopKycStaff(auth.user.role)) {
    return assertCoopEntityScope(auth, entity.cooperative_id);
  }
  if (role === "HOUSEHOLD" && opts.applicantUserId != null) {
    return auth.user.id === opts.applicantUserId
      ? { ok: true }
      : { ok: false, message: "Not the household applicant" };
  }
  if (role === "DRIVER" && opts.applicantUserId != null) {
    return auth.user.id === opts.applicantUserId
      ? { ok: true }
      : { ok: false, message: "Not the driver applicant" };
  }
  if (role === "FLEET_OWNER") {
    if (opts.applicantUserId != null && auth.user.id === opts.applicantUserId) {
      return { ok: true };
    }
    if (opts.vehicleOwnerUserId != null && auth.user.id === opts.vehicleOwnerUserId) {
      return { ok: true };
    }
  }
  return { ok: false, message: "Insufficient role for resubmit" };
}

export function canApproveFrom(status: ApprovalStatus | HouseholdStatus): boolean {
  return status === "PENDING" || status === "NEEDS_CORRECTION";
}

export function canRejectFrom(status: ApprovalStatus | HouseholdStatus): boolean {
  return status === "PENDING" || status === "NEEDS_CORRECTION";
}

export function canSuspendFrom(status: ApprovalStatus | HouseholdStatus): boolean {
  return status === "APPROVED";
}

export function canRequestCorrectionFrom(status: ApprovalStatus | HouseholdStatus): boolean {
  return status === "PENDING" || status === "APPROVED";
}

export function canResubmitFrom(status: ApprovalStatus | HouseholdStatus): boolean {
  return status === "NEEDS_CORRECTION";
}

/** HH-KYC-COMMITTEE-1: read cooperative.settings_json.household_approval_quorum (default 1). */
export function getHouseholdApprovalQuorum(settingsJson: unknown): number {
  if (settingsJson == null || typeof settingsJson !== "object" || Array.isArray(settingsJson)) {
    return DEFAULT_HOUSEHOLD_APPROVAL_QUORUM;
  }
  const raw = (settingsJson as Record<string, unknown>).household_approval_quorum;
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1) return raw;
  return DEFAULT_HOUSEHOLD_APPROVAL_QUORUM;
}

export async function recordHouseholdApprovalAudit(params: {
  household_id: number;
  approver_user_id: number;
  role: string;
  status: ApprovalStatus | HouseholdStatus;
}) {
  await recordKycAudit({
    entity_type: "household",
    entity_id: params.household_id,
    before: { status: params.status },
    after: { approver_id: params.approver_user_id, role: params.role },
    performed_by_user_id: params.approver_user_id,
    action: KYC_HOUSEHOLD_APPROVAL_ACTION,
  });
}
