import type { UserRole } from "../types/userRole";
import { prisma } from "../db/prisma";
import { toBig, toNum } from "./id";

export type SessionRow = {
  token: string;
  userId: number;
  mobile_number: string;
  role: UserRole;
  is_active: boolean;
  mineId?: number;
  expiresAt: number;
};

export async function createSession(params: {
  token: string;
  userId: number;
  mobile_number: string;
  role: UserRole;
  is_active: boolean;
  expiresAt: Date;
}): Promise<SessionRow> {
  await prisma.sessions.create({
    data: {
      token: params.token,
      user_id: toBig(params.userId),
      expires_at: params.expiresAt,
    },
  });
  return {
    token: params.token,
    userId: params.userId,
    mobile_number: params.mobile_number,
    role: params.role,
    is_active: params.is_active,
    mineId: undefined,
    expiresAt: params.expiresAt.getTime(),
  };
}

export async function getSession(token: string): Promise<SessionRow | null> {
  const row = await prisma.sessions.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!row) return null;
  if (row.expires_at.getTime() < Date.now()) {
    await prisma.sessions.delete({ where: { token } }).catch(() => undefined);
    return null;
  }
  return {
    token: row.token,
    userId: toNum(row.user_id),
    mobile_number: row.user.mobile_number,
    role: row.user.role,
    is_active: row.user.is_active,
    mineId: row.mine_id != null ? toNum(row.mine_id) : undefined,
    expiresAt: row.expires_at.getTime(),
  };
}

export async function setSessionMine(token: string, mineId: number): Promise<SessionRow | null> {
  try {
    const row = await prisma.sessions.update({
      where: { token },
      data: { mine_id: toBig(mineId) },
      include: { user: true },
    });
    if (row.expires_at.getTime() < Date.now()) return null;
    return {
      token: row.token,
      userId: toNum(row.user_id),
      mobile_number: row.user.mobile_number,
      role: row.user.role,
      is_active: row.user.is_active,
      mineId: toNum(row.mine_id),
      expiresAt: row.expires_at.getTime(),
    };
  } catch {
    return null;
  }
}
