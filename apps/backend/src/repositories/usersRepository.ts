import type { UserRole } from "../types/userRole";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { normalizeUsername, userHasPassword } from "../lib/passwordHash";
import { runWithSoftDeleteBypass } from "../lib/softDelete";
import { toBig, toNum } from "./id";

export type UserRow = {
  id: number;
  mobile_number: string;
  username?: string;
  national_id?: string;
  bank_iban?: string;
  village_id?: number;
  full_name?: string;
  role: UserRole;
  is_active: boolean;
  is_weighbridge_operator: boolean;
  cooperative_id?: number;
  created_at: Date;
  deleted_at?: Date;
};

export type AdminUserListRow = UserRow & {
  has_password: boolean;
  mine_id?: number;
  mine_code?: string;
  mine_name?: string;
  cooperative_name?: string;
  village_name?: string;
};

export type UserAuthRow = UserRow & { password_hash: string };

function mapUser(row: {
  id: bigint;
  mobile_number: string;
  username?: string | null;
  national_id: string | null;
  bank_iban: string | null;
  village_id: bigint | null;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  is_weighbridge_operator: boolean;
  cooperative_id: bigint | null;
  created_at: Date;
  deleted_at?: Date | null;
}): UserRow {
  return {
    id: toNum(row.id),
    mobile_number: row.mobile_number,
    username: row.username ?? undefined,
    national_id: row.national_id ?? undefined,
    bank_iban: row.bank_iban ?? undefined,
    village_id: row.village_id != null ? toNum(row.village_id) : undefined,
    full_name: row.full_name ?? undefined,
    role: row.role,
    is_active: row.is_active,
    is_weighbridge_operator: row.is_weighbridge_operator,
    cooperative_id: row.cooperative_id != null ? toNum(row.cooperative_id) : undefined,
    created_at: row.created_at,
    deleted_at: row.deleted_at ?? undefined,
  };
}

export async function findUserByMobile(mobile_number: string): Promise<UserRow | null> {
  const row = await prisma.users.findUnique({ where: { mobile_number } });
  return row ? mapUser(row) : null;
}

export async function findUserById(id: number): Promise<UserRow | null> {
  const row = await prisma.users.findUnique({ where: { id: toBig(id) } });
  return row ? mapUser(row) : null;
}

export async function findUserByUsername(username: string): Promise<UserAuthRow | null> {
  const normalized = normalizeUsername(username);
  const row = await prisma.users.findFirst({
    where: { username: { equals: normalized, mode: "insensitive" } },
  });
  if (!row) return null;
  return { ...mapUser(row), password_hash: row.password_hash };
}

export async function findUserByUsernameExcluding(
  username: string,
  excludeUserId: number,
): Promise<UserRow | null> {
  const normalized = normalizeUsername(username);
  const row = await prisma.users.findFirst({
    where: {
      username: { equals: normalized, mode: "insensitive" },
      id: { not: toBig(excludeUserId) },
    },
  });
  return row ? mapUser(row) : null;
}

export async function createUser(input: {
  mobile_number: string;
  username?: string | null;
  password_hash?: string;
  national_id?: string | null;
  bank_iban?: string | null;
  village_id?: number | null;
  role: UserRole;
  full_name?: string;
  cooperative_id?: number | null;
  is_active?: boolean;
  is_weighbridge_operator?: boolean;
}): Promise<UserRow> {
  const row = await prisma.users.create({
    data: {
      mobile_number: input.mobile_number,
      username: input.username ?? null,
      password_hash: input.password_hash ?? "",
      national_id: input.national_id ?? null,
      bank_iban: input.bank_iban ?? null,
      village_id: input.village_id != null ? toBig(input.village_id) : null,
      full_name: input.full_name ?? null,
      role: input.role,
      is_active: input.is_active ?? true,
      is_weighbridge_operator: input.is_weighbridge_operator ?? false,
      cooperative_id: input.cooperative_id != null ? toBig(input.cooperative_id) : null,
    },
  });
  return mapUser(row);
}

export async function upsertUserByMobile(
  mobile_number: string,
  role: UserRole,
  patch?: Partial<
    Pick<UserRow, "is_active" | "cooperative_id" | "is_weighbridge_operator" | "national_id" | "full_name">
  >,
): Promise<UserRow> {
  const row = await prisma.users.upsert({
    where: { mobile_number },
    create: {
      mobile_number,
      role,
      password_hash: "",
      national_id: patch?.national_id ?? null,
      full_name: patch?.full_name ?? null,
      is_active: patch?.is_active ?? false,
      is_weighbridge_operator: patch?.is_weighbridge_operator ?? false,
      cooperative_id: patch?.cooperative_id != null ? toBig(patch.cooperative_id) : null,
    },
    update: {
      role,
      ...(patch?.is_active !== undefined ? { is_active: patch.is_active } : {}),
      ...(patch?.is_weighbridge_operator !== undefined
        ? { is_weighbridge_operator: patch.is_weighbridge_operator }
        : {}),
      ...(patch?.cooperative_id !== undefined
        ? { cooperative_id: patch.cooperative_id != null ? toBig(patch.cooperative_id) : null }
        : {}),
      ...(patch?.national_id !== undefined ? { national_id: patch.national_id } : {}),
      ...(patch?.full_name !== undefined ? { full_name: patch.full_name ?? null } : {}),
    },
  });
  return mapUser(row);
}

export async function listUsers(opts?: { includeDeleted?: boolean }): Promise<UserRow[]> {
  const fetch = () => prisma.users.findMany({ orderBy: { id: "asc" } });
  const rows = opts?.includeDeleted ? await runWithSoftDeleteBypass(fetch) : await fetch();
  return rows.map(mapUser);
}

export async function listUsersForAdmin(opts?: {
  includeDeleted?: boolean;
  mine_id?: number;
  cooperative_id?: number;
  village_id?: number;
  role?: UserRole;
  q?: string;
}): Promise<AdminUserListRow[]> {
  const and: Prisma.usersWhereInput[] = [];
  if (opts?.cooperative_id != null) and.push({ cooperative_id: toBig(opts.cooperative_id) });
  if (opts?.village_id != null) and.push({ village_id: toBig(opts.village_id) });
  if (opts?.role) and.push({ role: opts.role });
  if (opts?.mine_id != null) {
    and.push({
      OR: [
        { cooperative: { mine_id: toBig(opts.mine_id) } },
        {
          workspace_memberships: {
            some: { mine_id: toBig(opts.mine_id), status: "ACTIVE" },
          },
        },
      ],
    });
  }
  const q = opts?.q?.trim();
  if (q) {
    and.push({
      OR: [
        { mobile_number: { contains: q } },
        { username: { contains: q, mode: "insensitive" } },
        { national_id: { contains: q } },
        { full_name: { contains: q } },
        { bank_iban: { contains: q.toUpperCase() } },
      ],
    });
  }

  const where: Prisma.usersWhereInput = and.length > 0 ? { AND: and } : {};
  const fetch = () =>
    prisma.users.findMany({
      where,
      orderBy: { id: "asc" },
      include: {
        cooperative: { include: { mine: true } },
        village: true,
        workspace_memberships: {
          where: { status: "ACTIVE" },
          include: { mine: true },
          orderBy: { id: "asc" },
          take: 1,
        },
      },
    });

  const rows = opts?.includeDeleted ? await runWithSoftDeleteBypass(fetch) : await fetch();

  return rows.map((row) => {
    const base = mapUser(row);
    const membershipMine = row.workspace_memberships[0]?.mine;
    const coopMine = row.cooperative?.mine;
    const mine = membershipMine ?? coopMine;
    return {
      ...base,
      has_password: userHasPassword(row.password_hash),
      mine_id: mine ? toNum(mine.id) : undefined,
      mine_code: mine?.mine_code,
      mine_name: mine?.name,
      cooperative_name: row.cooperative?.name,
      village_name: row.village?.name,
    };
  });
}

export async function updateUser(
  userId: number,
  data: {
    role?: UserRole;
    cooperative_id?: number | null;
    bank_iban?: string | null;
    village_id?: number | null;
    is_active?: boolean;
    full_name?: string | null;
    national_id?: string | null;
    is_weighbridge_operator?: boolean;
  },
): Promise<UserRow | null> {
  try {
    const row = await prisma.users.update({
      where: { id: toBig(userId) },
      data: {
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.cooperative_id !== undefined
          ? { cooperative_id: data.cooperative_id != null ? toBig(data.cooperative_id) : null }
          : {}),
        ...(data.bank_iban !== undefined ? { bank_iban: data.bank_iban } : {}),
        ...(data.village_id !== undefined
          ? { village_id: data.village_id != null ? toBig(data.village_id) : null }
          : {}),
        ...(data.is_active !== undefined ? { is_active: data.is_active } : {}),
        ...(data.full_name !== undefined ? { full_name: data.full_name } : {}),
        ...(data.national_id !== undefined ? { national_id: data.national_id } : {}),
        ...(data.is_weighbridge_operator !== undefined
          ? { is_weighbridge_operator: data.is_weighbridge_operator }
          : {}),
      },
    });
    return mapUser(row);
  } catch {
    return null;
  }
}

export async function updateUserRole(
  userId: number,
  role: UserRole,
  cooperative_id?: number | null,
): Promise<UserRow | null> {
  return updateUser(userId, { role, cooperative_id });
}

export async function updateUserCredentials(
  userId: number,
  data: { username?: string | null; password_hash?: string },
): Promise<UserRow | null> {
  try {
    const row = await prisma.users.update({
      where: { id: toBig(userId) },
      data: {
        ...(data.username !== undefined ? { username: data.username } : {}),
        ...(data.password_hash !== undefined ? { password_hash: data.password_hash } : {}),
      },
    });
    return mapUser(row);
  } catch {
    return null;
  }
}

export async function restoreUser(
  userId: number,
  data: {
    mobile_number: string;
    national_id?: string | null;
    bank_iban?: string | null;
    village_id?: number | null;
    role: UserRole;
    full_name?: string | null;
    cooperative_id?: number | null;
    is_active?: boolean;
  },
): Promise<UserRow | null> {
  try {
    const row = await runWithSoftDeleteBypass(() =>
      prisma.users.update({
        where: { id: toBig(userId) },
        data: {
          deleted_at: null,
          mobile_number: data.mobile_number,
          national_id: data.national_id ?? null,
          bank_iban: data.bank_iban ?? null,
          village_id: data.village_id != null ? toBig(data.village_id) : null,
          role: data.role,
          full_name: data.full_name ?? null,
          cooperative_id: data.cooperative_id != null ? toBig(data.cooperative_id) : null,
          is_active: data.is_active ?? true,
        },
      }),
    );
    return mapUser(row);
  } catch {
    return null;
  }
}

export async function deactivateAndSoftDeleteUser(userId: number): Promise<UserRow | null> {
  try {
    await prisma.sessions.deleteMany({ where: { user_id: toBig(userId) } });
    const row = await prisma.users.update({
      where: { id: toBig(userId) },
      data: { is_active: false, deleted_at: new Date() },
    });
    return mapUser(row);
  } catch {
    return null;
  }
}

export async function setWeighbridgeOperator(userId: number, enabled: boolean): Promise<UserRow | null> {
  return updateUser(userId, { is_weighbridge_operator: enabled });
}

/** Migrate legacy COOP rows to COOP_ADMIN (idempotent). */
export async function migrateLegacyCoopRoles(): Promise<number> {
  const result = await prisma.users.updateMany({
    where: { role: "COOP" },
    data: { role: "COOP_ADMIN" },
  });
  return result.count;
}
