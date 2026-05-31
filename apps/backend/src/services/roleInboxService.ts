import type { UserRole } from "@prisma/client";
import type { AuthContext } from "../middleware/authMiddleware";
import {
  PERIOD_STATEMENT_APPROVAL_ROLES,
  listPeriodStatements,
  type PeriodStatementApprovalRole,
} from "./periodStatementService";
import * as cooperativesRepo from "../repositories/cooperativesRepository";
import * as objectionsRepo from "../repositories/objectionsRepository";
import { kycInboxTitle, listPendingKycInboxRows } from "../lib/kycInbox";
import { hasPermission } from "../types/permissions";
import { normalizeRole } from "../types/userRole";

export type RoleInboxItemType = "period_statement" | "kyc" | "objection";

export type RoleInboxItem = {
  type: RoleInboxItemType;
  id: number;
  title: string;
  status: string;
  waiting_since: string;
  required_roles: string[];
  /** Present for kyc rows — disambiguates numeric id across entity tables. */
  entity_kind?: "household" | "driver" | "fleet_owner" | "vehicle";
};

async function cooperativeIdsForMine(auth: AuthContext, mineId: number): Promise<number[]> {
  const coops = await cooperativesRepo.listCooperativesByMine(mineId);
  const role = normalizeRole(auth.user.role);
  if (role === "COOP_ADMIN" && auth.user.cooperative_id != null) {
    return coops.filter((c) => c.id === auth.user.cooperative_id).map((c) => c.id);
  }
  return coops.map((c) => c.id);
}

function remainingPeriodStatementRoles(
  approvals: Array<{ approver_role: string }>,
): PeriodStatementApprovalRole[] {
  const done = new Set(approvals.map((a) => a.approver_role));
  return PERIOD_STATEMENT_APPROVAL_ROLES.filter((r) => !done.has(r));
}

async function collectPeriodStatements(
  auth: AuthContext,
  mineId: number,
  userRole: UserRole,
): Promise<RoleInboxItem[]> {
  if (!hasPermission(userRole, "settlement:approve")) return [];
  const role = normalizeRole(userRole);
  if (!PERIOD_STATEMENT_APPROVAL_ROLES.includes(role as PeriodStatementApprovalRole)) {
    return [];
  }

  const coopIds = await cooperativeIdsForMine(auth, mineId);
  const statements = await listPeriodStatements({ mine_id: mineId });
  const items: RoleInboxItem[] = [];

  for (const s of statements) {
    if (s.status !== "PENDING_REVIEW") continue;
    if (coopIds.length > 0 && !coopIds.includes(s.cooperative_id)) continue;
    const approvedRoles = new Set(s.approvals.map((a) => a.approver_role));
    if (approvedRoles.has(role)) continue;

    const remaining = remainingPeriodStatementRoles(s.approvals);
    items.push({
      type: "period_statement",
      id: s.id,
      title: `صورت وضعیت ${s.period_key} — تعاونی #${s.cooperative_id}`,
      status: s.status,
      waiting_since: s.updated_at,
      required_roles: remaining,
    });
  }
  return items;
}

async function collectKyc(auth: AuthContext, mineId: number, userRole: UserRole): Promise<RoleInboxItem[]> {
  if (!hasPermission(userRole, "kyc:approve") && !hasPermission(userRole, "kyc:review")) {
    return [];
  }
  const coopIds = await cooperativeIdsForMine(auth, mineId);
  const rows = await listPendingKycInboxRows(coopIds);
  const required_roles = hasPermission(userRole, "kyc:approve")
    ? ["COOP_ADMIN"]
    : ["COOP_OPERATOR"];

  return rows.map((row) => ({
    type: "kyc" as const,
    id: row.id,
    entity_kind: row.entity_kind,
    title: kycInboxTitle(row),
    status: row.status,
    waiting_since: row.waiting_since,
    required_roles,
  }));
}

async function collectObjections(
  auth: AuthContext,
  mineId: number,
  userRole: UserRole,
): Promise<RoleInboxItem[]> {
  if (!hasPermission(userRole, "coop:manage")) return [];

  const coopIds = await cooperativeIdsForMine(auth, mineId);
  const items: RoleInboxItem[] = [];

  for (const coopId of coopIds) {
    const objections = await objectionsRepo.listObjections({ cooperative_id: coopId });
    for (const o of objections) {
      if (o.status !== "PENDING") continue;
      items.push({
        type: "objection",
        id: o.id,
        title: `اعتراض عضویت #${o.id} — خانوار ${o.target_household_id}`,
        status: o.status,
        waiting_since: o.created_at.toISOString(),
        required_roles: ["COOP_ADMIN"],
      });
    }
  }
  return items;
}

export function allowedInboxTypesForUser(userRole: UserRole): RoleInboxItemType[] {
  const types: RoleInboxItemType[] = [];
  if (hasPermission(userRole, "settlement:approve")) types.push("period_statement");
  if (hasPermission(userRole, "kyc:approve") || hasPermission(userRole, "kyc:review")) types.push("kyc");
  if (hasPermission(userRole, "coop:manage")) types.push("objection");
  return types;
}

export function userCanAccessInbox(userRole: UserRole): boolean {
  return allowedInboxTypesForUser(userRole).length > 0;
}

export async function listRoleInboxItems(params: {
  auth: AuthContext;
  mineId: number;
  types?: RoleInboxItemType[];
}): Promise<RoleInboxItem[]> {
  const userRole = params.auth.user.role;
  const allowed = allowedInboxTypesForUser(userRole);
  if (allowed.length === 0) return [];

  const requested =
    params.types && params.types.length > 0
      ? params.types.filter((t) => allowed.includes(t))
      : allowed;

  const chunks: RoleInboxItem[] = [];
  if (requested.includes("period_statement")) {
    chunks.push(...(await collectPeriodStatements(params.auth, params.mineId, userRole)));
  }
  if (requested.includes("kyc")) {
    chunks.push(...(await collectKyc(params.auth, params.mineId, userRole)));
  }
  if (requested.includes("objection")) {
    chunks.push(...(await collectObjections(params.auth, params.mineId, userRole)));
  }

  chunks.sort((a, b) => a.waiting_since.localeCompare(b.waiting_since));
  return chunks;
}
