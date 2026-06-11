import { prisma } from "../db/prisma";
import { isDevAuthEnabled } from "../config/env";
import type { UserRole } from "../types/userRole";
import { normalizeRole, isCoopScopedRole } from "../types/userRole";
import { toBig, toNum } from "./id";
import * as minesRepo from "./minesRepository";
import * as cooperativesRepo from "./cooperativesRepository";

export type MembershipKind = "COMMUNITY" | "OPERATIONAL";

export type WorkspaceMembershipRow = {
  id: number;
  user_id: number;
  mine_id: number;
  cooperative_id?: number;
  role_in_workspace: UserRole;
  status: "ACTIVE" | "SUSPENDED";
};

/** @deprecated Use WorkspaceEntry — kept for callers expecting grouped mine list */
export type WorkspaceSummary = {
  mine_id: number;
  mine_name: string;
  roles: UserRole[];
};

export type WorkspaceEntry = {
  membership_kind: MembershipKind;
  mine_id: number;
  mine_name: string;
  cooperative_id?: number;
  cooperative_name?: string;
  /** Display label: cooperative name (community) or mine name (operational) */
  subtitle: string;
  roles: UserRole[];
};

function mapRow(row: {
  id: bigint;
  user_id: bigint;
  mine_id: bigint;
  cooperative_id: bigint | null;
  role_in_workspace: UserRole;
  status: "ACTIVE" | "SUSPENDED";
}): WorkspaceMembershipRow {
  return {
    id: toNum(row.id),
    user_id: toNum(row.user_id),
    mine_id: toNum(row.mine_id),
    cooperative_id: row.cooperative_id != null ? toNum(row.cooperative_id) : undefined,
    role_in_workspace: row.role_in_workspace,
    status: row.status,
  };
}

function isGlobalWorkspaceRole(role: UserRole): boolean {
  return normalizeRole(role) === "ADMIN";
}

export function membershipKindForRole(role: UserRole): MembershipKind | null {
  const n = normalizeRole(role);
  if (n === "HOUSEHOLD" || isCoopScopedRole(role)) return "COMMUNITY";
  if (role === "EMPLOYER") return "OPERATIONAL";
  if (
    n === "DRIVER" ||
    n === "FLEET_OWNER" ||
    n === "OPERATOR" ||
    n === "CONSULTANT" ||
    n === "OPERATION_ADMIN"
  ) {
    return "OPERATIONAL";
  }
  return null;
}

export function isCommunityMembershipRole(role: UserRole): boolean {
  return membershipKindForRole(role) === "COMMUNITY";
}

export function isOperationalMembershipRole(role: UserRole): boolean {
  return membershipKindForRole(role) === "OPERATIONAL";
}

function workspaceDenied(): Error & { statusCode: number; code: string } {
  const err = new Error("workspace_access_denied") as Error & { statusCode: number; code: string };
  err.statusCode = 403;
  err.code = "workspace_access_denied";
  return err;
}

export async function listActiveForUser(userId: number, userRole: UserRole): Promise<WorkspaceEntry[]> {
  if (isGlobalWorkspaceRole(userRole)) {
    const mines = await minesRepo.listMines();
    return mines.map((m) => ({
      membership_kind: "OPERATIONAL" as const,
      mine_id: m.id,
      mine_name: m.name,
      subtitle: m.name,
      roles: [userRole],
    }));
  }

  const rows = await prisma.user_workspace_memberships.findMany({
    where: { user_id: toBig(userId), status: "ACTIVE" },
    include: { mine: true },
    orderBy: [{ mine_id: "asc" }, { id: "asc" }],
  });

  const coopNameCache = new Map<number, string>();
  async function coopName(coopId: number): Promise<string> {
    const cached = coopNameCache.get(coopId);
    if (cached) return cached;
    const coop = await cooperativesRepo.findCooperativeById(coopId);
    const name = coop?.name ?? `تعاونی ${coopId}`;
    coopNameCache.set(coopId, name);
    return name;
  }

  const buckets = new Map<string, WorkspaceEntry>();

  for (const row of rows) {
    const kind = membershipKindForRole(row.role_in_workspace);
    if (!kind) continue;

    const mineId = toNum(row.mine_id);
    const coopId = row.cooperative_id != null ? toNum(row.cooperative_id) : undefined;
    const key =
      kind === "COMMUNITY"
        ? `COMMUNITY:${coopId ?? mineId}`
        : `OPERATIONAL:${mineId}`;

    let subtitle = row.mine.name;
    if (kind === "COMMUNITY" && coopId != null) {
      subtitle = await coopName(coopId);
    }

    const existing = buckets.get(key);
    if (existing) {
      if (!existing.roles.includes(row.role_in_workspace)) {
        existing.roles.push(row.role_in_workspace);
      }
      continue;
    }

    buckets.set(key, {
      membership_kind: kind,
      mine_id: mineId,
      mine_name: row.mine.name,
      cooperative_id: kind === "COMMUNITY" ? coopId : undefined,
      cooperative_name: kind === "COMMUNITY" && coopId != null ? subtitle : undefined,
      subtitle,
      roles: [row.role_in_workspace],
    });
  }

  const result = [...buckets.values()];
  result.sort((a, b) => {
    if (a.membership_kind !== b.membership_kind) {
      return a.membership_kind === "COMMUNITY" ? -1 : 1;
    }
    if (a.subtitle !== b.subtitle) return a.subtitle.localeCompare(b.subtitle, "fa");
    return a.mine_id - b.mine_id;
  });
  return result;
}

export async function findActiveMembership(params: {
  userId: number;
  mineId: number;
  cooperativeId?: number;
}): Promise<WorkspaceMembershipRow | null> {
  const rows = await prisma.user_workspace_memberships.findMany({
    where: {
      user_id: toBig(params.userId),
      mine_id: toBig(params.mineId),
      status: "ACTIVE",
    },
  });

  if (rows.length === 0) return null;

  if (params.cooperativeId != null) {
    const exact = rows.find((r) => r.cooperative_id != null && toNum(r.cooperative_id) === params.cooperativeId);
    if (exact) return mapRow(exact);
    const mineWide = rows.find((r) => r.cooperative_id == null);
    return mineWide ? mapRow(mineWide) : null;
  }

  return mapRow(rows[0]!);
}

/** Demo/UAT: create missing workspace row so seeded users work without re-running db:seed. */
export async function ensureDemoWorkspaceMembership(params: {
  userId: number;
  userRole: UserRole;
  mineId?: number;
  cooperativeId?: number;
  membershipKind?: MembershipKind;
}): Promise<void> {
  if (!isDevAuthEnabled()) return;
  if (isGlobalWorkspaceRole(params.userRole)) return;

  const kind = params.membershipKind ?? membershipKindForRole(params.userRole);
  if (!kind) return;

  let mineId = params.mineId;
  if (mineId == null) {
    if (params.cooperativeId != null) {
      const coop = await cooperativesRepo.findCooperativeById(params.cooperativeId);
      if (coop) mineId = coop.mine_id;
    }
    if (mineId == null) {
      const firstMine = await prisma.mines.findFirst({ orderBy: { id: "asc" } });
      if (!firstMine) return;
      mineId = toNum(firstMine.id);
    }
  }

  const coopIdForLookup = kind === "COMMUNITY" ? params.cooperativeId : undefined;
  const existing = await findActiveMembership({
    userId: params.userId,
    mineId,
    cooperativeId: coopIdForLookup,
  });
  if (existing) return;

  let cooperativeId = kind === "COMMUNITY" ? params.cooperativeId : undefined;
  if (kind === "COMMUNITY" && cooperativeId == null) {
    const user = await prisma.users.findUnique({ where: { id: toBig(params.userId) } });
    cooperativeId =
      user?.cooperative_id != null ? toNum(user.cooperative_id) : undefined;
    if (cooperativeId == null) {
      const coop = await prisma.cooperatives.findFirst({
        where: { mine_id: toBig(mineId) },
        orderBy: { id: "asc" },
      });
      if (coop) cooperativeId = toNum(coop.id);
    }
  }

  await upsertMembership({
    user_id: params.userId,
    mine_id: mineId,
    cooperative_id: cooperativeId,
    role_in_workspace: params.userRole,
    status: "ACTIVE",
  });
}

export async function assertUserCanAccessMine(params: {
  userId: number;
  userRole: UserRole;
  mineId: number;
  cooperativeId?: number;
  membershipKind?: MembershipKind;
}): Promise<void> {
  if (isGlobalWorkspaceRole(params.userRole)) return;

  const rows = await prisma.user_workspace_memberships.findMany({
    where: {
      user_id: toBig(params.userId),
      mine_id: toBig(params.mineId),
      status: "ACTIVE",
    },
  });

  if (rows.length === 0) throw workspaceDenied();

  const kind: MembershipKind =
    params.membershipKind ?? (params.cooperativeId != null ? "COMMUNITY" : "OPERATIONAL");

  if (kind === "COMMUNITY") {
    const community = rows.filter((r) => isCommunityMembershipRole(r.role_in_workspace));
    if (community.length === 0) throw workspaceDenied();
    if (params.cooperativeId != null) {
      const match = community.some(
        (r) => r.cooperative_id != null && toNum(r.cooperative_id) === params.cooperativeId,
      );
      if (!match) throw workspaceDenied();
    }
    return;
  }

  const operational = rows.filter((r) => isOperationalMembershipRole(r.role_in_workspace));
  if (operational.length === 0) throw workspaceDenied();
}

export async function assertOperationalMineAccess(params: {
  userId: number;
  userRole: UserRole;
  mineId: number;
}): Promise<void> {
  return assertUserCanAccessMine({
    ...params,
    membershipKind: "OPERATIONAL",
  });
}

export async function upsertMembership(params: {
  user_id: number;
  mine_id: number;
  cooperative_id?: number;
  role_in_workspace: UserRole;
  status?: "ACTIVE" | "SUSPENDED";
}): Promise<WorkspaceMembershipRow> {
  const existing = await prisma.user_workspace_memberships.findFirst({
    where: {
      user_id: toBig(params.user_id),
      mine_id: toBig(params.mine_id),
      cooperative_id: params.cooperative_id != null ? toBig(params.cooperative_id) : null,
    },
  });

  if (existing) {
    const row = await prisma.user_workspace_memberships.update({
      where: { id: existing.id },
      data: {
        role_in_workspace: params.role_in_workspace,
        status: params.status ?? "ACTIVE",
      },
    });
    return mapRow(row);
  }

  const row = await prisma.user_workspace_memberships.create({
    data: {
      user_id: toBig(params.user_id),
      mine_id: toBig(params.mine_id),
      cooperative_id: params.cooperative_id != null ? toBig(params.cooperative_id) : null,
      role_in_workspace: params.role_in_workspace,
      status: params.status ?? "ACTIVE",
    },
  });
  return mapRow(row);
}
