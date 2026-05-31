import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { toBig, toNum } from "./id";

export type AuditLogRow = {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  before_value?: unknown;
  after_value?: unknown;
  performed_by_user_id?: number;
  reason?: string;
  at_created: Date;
};

type Tx = Prisma.TransactionClient;

function mapRow(r: {
  id: bigint;
  entity_type: string;
  entity_id: string;
  action: string;
  before_value: unknown;
  after_value: unknown;
  performed_by_user_id: bigint | null;
  reason: string | null;
  created_at: Date;
}): AuditLogRow {
  return {
    id: toNum(r.id),
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    action: r.action,
    before_value: r.before_value ?? undefined,
    after_value: r.after_value ?? undefined,
    performed_by_user_id: r.performed_by_user_id != null ? toNum(r.performed_by_user_id) : undefined,
    reason: r.reason ?? undefined,
    at_created: r.created_at,
  };
}

export async function insertAuditLog(
  entry: Omit<AuditLogRow, "id" | "at_created">,
  tx?: Tx,
): Promise<AuditLogRow> {
  const db = tx ?? prisma;
  const r = await db.audit_logs.create({
    data: {
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      action: entry.action,
      before_value: entry.before_value as object | undefined,
      after_value: entry.after_value as object | undefined,
      performed_by_user_id: entry.performed_by_user_id != null ? toBig(entry.performed_by_user_id) : null,
      reason: entry.reason,
    },
  });
  return mapRow(r);
}

export async function listAuditLogsByEntity(entity_type: string, entity_id: string): Promise<AuditLogRow[]> {
  const rows = await prisma.audit_logs.findMany({
    where: { entity_type, entity_id },
    orderBy: { created_at: "asc" },
  });
  return rows.map(mapRow);
}

/** Latest correction reason per entity (kyc_change → NEEDS_CORRECTION). */
export async function latestKycCorrectionReasons(
  entity_type: string,
  entity_ids: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (entity_ids.length === 0) return out;

  const rows = await prisma.audit_logs.findMany({
    where: {
      entity_type,
      entity_id: { in: entity_ids },
      action: "kyc_change",
      reason: { not: null },
    },
    orderBy: { created_at: "desc" },
    select: { entity_id: true, reason: true, after_value: true },
  });

  for (const row of rows) {
    if (out.has(row.entity_id)) continue;
    const after = row.after_value as { status?: string } | null;
    if (after?.status === "NEEDS_CORRECTION" && row.reason) {
      out.set(row.entity_id, row.reason);
    }
  }
  return out;
}

export type AuditLogQueryParams = {
  entity_type?: string;
  entity_id?: string;
  from?: Date;
  to?: Date;
  user_id?: number;
  limit: number;
  offset: number;
  scopeWhere?: Prisma.audit_logsWhereInput;
};

export async function queryAuditLogs(
  params: AuditLogQueryParams,
): Promise<{ items: AuditLogRow[]; total: number }> {
  const filters: Prisma.audit_logsWhereInput[] = [];
  if (params.scopeWhere) filters.push(params.scopeWhere);
  if (params.entity_type) filters.push({ entity_type: params.entity_type });
  if (params.entity_id) filters.push({ entity_id: params.entity_id });
  if (params.user_id != null) {
    filters.push({ performed_by_user_id: toBig(params.user_id) });
  }
  if (params.from || params.to) {
    const created_at: Prisma.DateTimeFilter = {};
    if (params.from) created_at.gte = params.from;
    if (params.to) created_at.lte = params.to;
    filters.push({ created_at });
  }

  const where: Prisma.audit_logsWhereInput = filters.length ? { AND: filters } : {};

  const [rows, total] = await Promise.all([
    prisma.audit_logs.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: params.limit,
      skip: params.offset,
    }),
    prisma.audit_logs.count({ where }),
  ]);

  return { items: rows.map(mapRow), total };
}
