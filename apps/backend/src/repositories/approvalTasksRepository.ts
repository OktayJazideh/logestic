import type { ApprovalTaskStatus } from "@prisma/client";
import { prisma } from "../db/prisma";
import { computeApprovalDueAt } from "../lib/slaConfig";
import { toBig, toNum } from "./id";
import type { ApprovalTaskEntityType } from "../lib/approvalTasks";

export type ApprovalTaskRow = {
  id: number;
  entity_type: ApprovalTaskEntityType;
  entity_id: string;
  required_role: string;
  due_at: string;
  completed_at: string | null;
  escalated_to_role: string | null;
  status: ApprovalTaskStatus;
  created_at: string;
  mine_id?: number;
  cooperative_id?: number;
};

function mapTask(row: {
  id: bigint;
  entity_type: string;
  entity_id: string;
  required_role: string;
  due_at: Date | null;
  completed_at: Date | null;
  escalated_to: string | null;
  status: ApprovalTaskStatus;
  created_at: Date;
}): ApprovalTaskRow {
  return {
    id: toNum(row.id),
    entity_type: row.entity_type as ApprovalTaskEntityType,
    entity_id: row.entity_id,
    required_role: row.required_role,
    due_at: row.due_at?.toISOString() ?? new Date(0).toISOString(),
    completed_at: row.completed_at?.toISOString() ?? null,
    escalated_to_role: row.escalated_to,
    status: row.status,
    created_at: row.created_at.toISOString(),
  };
}

export async function createPendingApprovalTasks(params: {
  entity_type: ApprovalTaskEntityType;
  entity_id: string | number;
  required_roles: readonly string[];
  due_at?: Date;
}): Promise<void> {
  const entityId = String(params.entity_id);
  const dueAt = params.due_at ?? computeApprovalDueAt();

  await prisma.approval_tasks.deleteMany({
    where: {
      entity_type: params.entity_type,
      entity_id: entityId,
      status: "PENDING",
    },
  });

  if (params.required_roles.length === 0) return;

  await prisma.approval_tasks.createMany({
    data: params.required_roles.map((role) => ({
      entity_type: params.entity_type,
      entity_id: entityId,
      required_role: role,
      due_at: dueAt,
      status: "PENDING",
    })),
  });
}

export async function completeApprovalTaskForRole(params: {
  entity_type: ApprovalTaskEntityType;
  entity_id: string | number;
  required_role: string;
}): Promise<void> {
  const entityId = String(params.entity_id);
  await prisma.approval_tasks.updateMany({
    where: {
      entity_type: params.entity_type,
      entity_id: entityId,
      required_role: params.required_role,
      status: "PENDING",
    },
    data: {
      status: "DONE",
      completed_at: new Date(),
    },
  });
}

export async function cancelPendingApprovalTasks(params: {
  entity_type: ApprovalTaskEntityType;
  entity_id: string | number;
}): Promise<void> {
  const entityId = String(params.entity_id);
  await prisma.approval_tasks.deleteMany({
    where: {
      entity_type: params.entity_type,
      entity_id: entityId,
      status: "PENDING",
    },
  });
}

export async function getPendingTasksForEntity(params: {
  entity_type: ApprovalTaskEntityType;
  entity_id: string | number;
}): Promise<ApprovalTaskRow[]> {
  const rows = await prisma.approval_tasks.findMany({
    where: {
      entity_type: params.entity_type,
      entity_id: String(params.entity_id),
      status: "PENDING",
    },
    orderBy: { due_at: "asc" },
  });
  return rows.map(mapTask);
}

export async function isEntityApprovalOverdue(params: {
  entity_type: ApprovalTaskEntityType;
  entity_id: string | number;
  now?: Date;
}): Promise<boolean> {
  const now = params.now ?? new Date();
  const count = await prisma.approval_tasks.count({
    where: {
      entity_type: params.entity_type,
      entity_id: String(params.entity_id),
      status: "PENDING",
      due_at: { lt: now },
    },
  });
  return count > 0;
}

async function enrichMineContext(tasks: ApprovalTaskRow[]): Promise<ApprovalTaskRow[]> {
  const psIds = tasks
    .filter((t) => t.entity_type === "period_statement")
    .map((t) => toBig(Number(t.entity_id)));
  const sbIds = tasks
    .filter((t) => t.entity_type === "settlement_batch")
    .map((t) => toBig(Number(t.entity_id)));

  const [statements, batches] = await Promise.all([
    psIds.length
      ? prisma.period_statements.findMany({
          where: { id: { in: psIds } },
          select: { id: true, mine_id: true, cooperative_id: true },
        })
      : [],
    sbIds.length
      ? prisma.settlement_batches.findMany({
          where: { id: { in: sbIds } },
          select: { id: true, mine_id: true },
        })
      : [],
  ]);

  const psMap = new Map(statements.map((s) => [toNum(s.id), s]));
  const sbMap = new Map(batches.map((b) => [toNum(b.id), b]));

  return tasks.map((t) => {
    if (t.entity_type === "period_statement") {
      const ps = psMap.get(Number(t.entity_id));
      if (ps) {
        return {
          ...t,
          mine_id: toNum(ps.mine_id),
          cooperative_id: toNum(ps.cooperative_id),
        };
      }
    }
    if (t.entity_type === "settlement_batch") {
      const sb = sbMap.get(Number(t.entity_id));
      if (sb?.mine_id != null) {
        return { ...t, mine_id: toNum(sb.mine_id) };
      }
    }
    return t;
  });
}

/** PENDING tasks with due_at in the past (optionally scoped to mine). */
export async function listStaleApprovalTasks(filters: { mine_id?: number }): Promise<ApprovalTaskRow[]> {
  const now = new Date();
  const rows = await prisma.approval_tasks.findMany({
    where: {
      status: "PENDING",
      due_at: { lt: now },
    },
    orderBy: [{ due_at: "asc" }, { id: "asc" }],
  });

  let tasks = rows.map(mapTask);
  tasks = await enrichMineContext(tasks);

  if (filters.mine_id != null) {
    tasks = tasks.filter((t) => t.mine_id === filters.mine_id);
  }

  return tasks;
}
