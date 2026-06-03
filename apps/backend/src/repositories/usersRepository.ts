import type { UserRole } from "../types/userRole";
import { prisma } from "../db/prisma";
import { runWithSoftDeleteBypass } from "../lib/softDelete";
import { toBig, toNum } from "./id";

export type UserRow = {
  id: number;
  mobile_number: string;
  national_id?: string;
  full_name?: string;
  role: UserRole;
  is_active: boolean;
  is_weighbridge_operator: boolean;
  cooperative_id?: number;
  created_at: Date;
  deleted_at?: Date;
};

function mapUser(row: {
  id: bigint;
  mobile_number: string;
  national_id: string | null;
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
    national_id: row.national_id ?? undefined,
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

export async function createUser(input: {
  mobile_number: string;
  national_id: string;
  role: UserRole;
  full_name?: string;
  cooperative_id?: number | null;
  is_active?: boolean;
  is_weighbridge_operator?: boolean;
}): Promise<UserRow> {
  const row = await prisma.users.create({
    data: {
      mobile_number: input.mobile_number,
      national_id: input.national_id,
      full_name: input.full_name ?? null,
      role: input.role,
      password_hash: "",
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

export async function updateUser(
  userId: number,
  data: {
    role?: UserRole;
    cooperative_id?: number | null;
    is_active?: boolean;
    full_name?: string | null;
    national_id?: string;
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

export async function restoreUser(
  userId: number,
  data: {
    mobile_number: string;
    national_id: string;
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
          national_id: data.national_id,
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
