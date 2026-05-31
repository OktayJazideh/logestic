import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { toBig, toNum } from "./id";

export type ReconciliationIssueRow = {
  id: number;
  run_id: string;
  code: string;
  entity_type: string;
  entity_id: string;
  message: string;
  details?: Record<string, unknown>;
  status: "OPEN" | "RESOLVED";
  resolved_at?: Date;
  resolved_by_user_id?: number;
  resolve_reason?: string;
  created_at: Date;
};

export type NewReconciliationIssue = {
  code: string;
  entity_type: string;
  entity_id: string;
  message: string;
  details?: Record<string, unknown>;
};

function mapRow(r: {
  id: bigint;
  run_id: string;
  code: string;
  entity_type: string;
  entity_id: string;
  message: string;
  details: Prisma.JsonValue | null;
  status: "OPEN" | "RESOLVED";
  resolved_at: Date | null;
  resolved_by_user_id: bigint | null;
  resolve_reason: string | null;
  created_at: Date;
}): ReconciliationIssueRow {
  return {
    id: toNum(r.id),
    run_id: r.run_id,
    code: r.code,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    message: r.message,
    details: r.details != null && typeof r.details === "object" && !Array.isArray(r.details)
      ? (r.details as Record<string, unknown>)
      : undefined,
    status: r.status,
    resolved_at: r.resolved_at ?? undefined,
    resolved_by_user_id: r.resolved_by_user_id != null ? toNum(r.resolved_by_user_id) : undefined,
    resolve_reason: r.resolve_reason ?? undefined,
    created_at: r.created_at,
  };
}

export async function insertIssues(runId: string, issues: NewReconciliationIssue[]): Promise<number> {
  if (issues.length === 0) return 0;
  const result = await prisma.reconciliation_issues.createMany({
    data: issues.map((i) => ({
      run_id: runId,
      code: i.code,
      entity_type: i.entity_type,
      entity_id: i.entity_id,
      message: i.message,
      details: i.details != null ? (i.details as Prisma.InputJsonValue) : undefined,
    })),
  });
  return result.count;
}

export async function listIssues(params?: {
  status?: "OPEN" | "RESOLVED";
  run_id?: string;
  limit?: number;
}): Promise<ReconciliationIssueRow[]> {
  const rows = await prisma.reconciliation_issues.findMany({
    where: {
      status: params?.status,
      run_id: params?.run_id,
    },
    orderBy: { created_at: "desc" },
    take: params?.limit ?? 200,
  });
  return rows.map(mapRow);
}

export async function findIssueById(id: number): Promise<ReconciliationIssueRow | null> {
  const row = await prisma.reconciliation_issues.findUnique({ where: { id: toBig(id) } });
  return row ? mapRow(row) : null;
}

export async function resolveIssue(
  id: number,
  resolvedByUserId: number,
  reason: string,
): Promise<ReconciliationIssueRow | null> {
  const existing = await prisma.reconciliation_issues.findFirst({
    where: { id: toBig(id), status: "OPEN" },
  });
  if (!existing) return null;

  const row = await prisma.reconciliation_issues.update({
    where: { id: toBig(id) },
    data: {
      status: "RESOLVED",
      resolved_at: new Date(),
      resolved_by_user_id: toBig(resolvedByUserId),
      resolve_reason: reason,
    },
  });
  return mapRow(row);
}

export async function deleteAllIssuesForTests(): Promise<void> {
  await prisma.reconciliation_issues.deleteMany();
}

export async function countOpenIssues(): Promise<number> {
  return prisma.reconciliation_issues.count({ where: { status: "OPEN" } });
}
