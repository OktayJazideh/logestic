import type { UserRole } from "../types/userRole";
import { prisma } from "../db/prisma";
import { toBig, toNum } from "./id";

export type UserRow = {
  id: number;
  mobile_number: string;
  role: UserRole;
  is_active: boolean;
  is_weighbridge_operator: boolean;
  cooperative_id?: number;
  created_at: Date;
};

function mapUser(row: {
  id: bigint;
  mobile_number: string;
  role: UserRole;
  is_active: boolean;
  is_weighbridge_operator: boolean;
  cooperative_id: bigint | null;
  created_at: Date;
}): UserRow {
  return {
    id: toNum(row.id),
    mobile_number: row.mobile_number,
    role: row.role,
    is_active: row.is_active,
    is_weighbridge_operator: row.is_weighbridge_operator,
    cooperative_id: row.cooperative_id != null ? toNum(row.cooperative_id) : undefined,
    created_at: row.created_at,
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

export async function upsertUserByMobile(
  mobile_number: string,
  role: UserRole,
  patch?: Partial<Pick<UserRow, "is_active" | "cooperative_id" | "is_weighbridge_operator">>,
): Promise<UserRow> {
  const row = await prisma.users.upsert({
    where: { mobile_number },
    create: {
      mobile_number,
      role,
      password_hash: "",
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
    },
  });
  return mapUser(row);
}

export async function listUsers(): Promise<UserRow[]> {
  const rows = await prisma.users.findMany({ orderBy: { id: "asc" } });
  return rows.map(mapUser);
}

export async function updateUserRole(
  userId: number,
  role: UserRole,
  cooperative_id?: number | null,
): Promise<UserRow | null> {
  try {
    const row = await prisma.users.update({
      where: { id: toBig(userId) },
      data: {
        role,
        ...(cooperative_id !== undefined
          ? { cooperative_id: cooperative_id != null ? toBig(cooperative_id) : null }
          : {}),
      },
    });
    return mapUser(row);
  } catch {
    return null;
  }
}

export async function setWeighbridgeOperator(userId: number, enabled: boolean): Promise<UserRow | null> {
  try {
    const row = await prisma.users.update({
      where: { id: toBig(userId) },
      data: { is_weighbridge_operator: enabled },
    });
    return mapUser(row);
  } catch {
    return null;
  }
}

/** Migrate legacy COOP rows to COOP_ADMIN (idempotent). */
export async function migrateLegacyCoopRoles(): Promise<number> {
  const result = await prisma.users.updateMany({
    where: { role: "COOP" },
    data: { role: "COOP_ADMIN" },
  });
  return result.count;
}
