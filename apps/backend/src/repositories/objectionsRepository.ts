import type { ObjectionStatus } from "@prisma/client";
import { prisma } from "../db/prisma";
import { toBig, toNum } from "./id";

export type ObjectionRow = {
  id: number;
  cooperative_id: number;
  target_household_id: number;
  reporter_user_id: number;
  reason: string;
  status: ObjectionStatus;
  resolved_by?: number;
  resolution_reason?: string;
  created_at: Date;
};

function mapRow(row: {
  id: bigint;
  cooperative_id: bigint;
  target_household_id: bigint;
  reporter_user_id: bigint;
  reason: string;
  status: ObjectionStatus;
  resolved_by: bigint | null;
  resolution_reason: string | null;
  created_at: Date;
}): ObjectionRow {
  return {
    id: toNum(row.id),
    cooperative_id: toNum(row.cooperative_id),
    target_household_id: toNum(row.target_household_id),
    reporter_user_id: toNum(row.reporter_user_id),
    reason: row.reason,
    status: row.status,
    resolved_by: row.resolved_by != null ? toNum(row.resolved_by) : undefined,
    resolution_reason: row.resolution_reason ?? undefined,
    created_at: row.created_at,
  };
}

function assertReporterUserId(reporter_user_id: number): void {
  if (!Number.isInteger(reporter_user_id) || reporter_user_id <= 0) {
    throw new Error("reporter_user_id must be a positive integer");
  }
}

export async function createObjection(params: {
  cooperative_id: number;
  target_household_id: number;
  reporter_user_id: number;
  reason: string;
}): Promise<ObjectionRow> {
  assertReporterUserId(params.reporter_user_id);
  const row = await prisma.membership_objections.create({
    data: {
      cooperative_id: toBig(params.cooperative_id),
      target_household_id: toBig(params.target_household_id),
      reporter_user_id: toBig(params.reporter_user_id),
      reason: params.reason,
      status: "PENDING",
    },
  });
  return mapRow(row);
}

export async function listObjections(params?: { cooperative_id?: number }): Promise<ObjectionRow[]> {
  const rows = await prisma.membership_objections.findMany({
    where: params?.cooperative_id != null ? { cooperative_id: toBig(params.cooperative_id) } : undefined,
    orderBy: { created_at: "desc" },
  });
  return rows.map(mapRow);
}

export async function listObjectionIdsByCooperative(cooperativeId: number): Promise<string[]> {
  const rows = await prisma.membership_objections.findMany({
    where: { cooperative_id: toBig(cooperativeId) },
    select: { id: true },
  });
  return rows.map((r) => String(toNum(r.id)));
}

export async function findObjectionById(id: number): Promise<ObjectionRow | null> {
  const row = await prisma.membership_objections.findUnique({ where: { id: toBig(id) } });
  return row ? mapRow(row) : null;
}

export async function resolveObjection(params: {
  objection_id: number;
  resolved_by: number;
  resolution_reason: string;
}): Promise<ObjectionRow | null> {
  try {
    const row = await prisma.membership_objections.update({
      where: { id: toBig(params.objection_id), status: "PENDING" },
      data: {
        status: "RESOLVED",
        resolved_by: toBig(params.resolved_by),
        resolution_reason: params.resolution_reason,
      },
    });
    return mapRow(row);
  } catch {
    return null;
  }
}
