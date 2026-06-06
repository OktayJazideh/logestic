import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { toBig, toNum } from "./id";

export type FinanceRuleScopeType = "GLOBAL" | "MINE" | "COOPERATIVE";
export type FinanceRuleStatus = "ACTIVE" | "ARCHIVED";

export type FinanceRuleScope =
  | { type: "GLOBAL" }
  | { type: "MINE"; mine_id: number }
  | { type: "COOPERATIVE"; cooperative_id: number };

export type FinanceRuleRow = {
  id: number;
  key: string;
  value: unknown;
  scope_type: FinanceRuleScopeType;
  mine_id?: number;
  cooperative_id?: number;
  effective_from: Date;
  effective_to?: Date;
  version: number;
  status: FinanceRuleStatus;
  created_by?: number;
  created_at: Date;
};

function mapRow(r: {
  id: bigint;
  key: string;
  value: unknown;
  scope_type: string;
  mine_id: bigint | null;
  cooperative_id: bigint | null;
  effective_from: Date;
  effective_to: Date | null;
  version: number;
  status: string;
  created_by: bigint | null;
  created_at: Date;
}): FinanceRuleRow {
  return {
    id: toNum(r.id),
    key: r.key,
    value: r.value,
    scope_type: r.scope_type as FinanceRuleScopeType,
    mine_id: r.mine_id != null ? toNum(r.mine_id) : undefined,
    cooperative_id: r.cooperative_id != null ? toNum(r.cooperative_id) : undefined,
    effective_from: r.effective_from,
    effective_to: r.effective_to ?? undefined,
    version: r.version,
    status: r.status as FinanceRuleStatus,
    created_by: r.created_by != null ? toNum(r.created_by) : undefined,
    created_at: r.created_at,
  };
}

function scopeWhere(scope: FinanceRuleScope) {
  if (scope.type === "GLOBAL") {
    return { scope_type: "GLOBAL", mine_id: null, cooperative_id: null };
  }
  if (scope.type === "MINE") {
    return { scope_type: "MINE", mine_id: toBig(scope.mine_id), cooperative_id: null };
  }
  return { scope_type: "COOPERATIVE", mine_id: null, cooperative_id: toBig(scope.cooperative_id) };
}

export async function listFinanceRules(params?: {
  key?: string;
  status?: FinanceRuleStatus;
  scope_type?: FinanceRuleScopeType;
  mine_id?: number;
  cooperative_id?: number;
  limit?: number;
}): Promise<FinanceRuleRow[]> {
  const rows = await prisma.finance_rules.findMany({
    where: {
      ...(params?.key ? { key: params.key } : {}),
      ...(params?.status ? { status: params.status } : {}),
      ...(params?.scope_type ? { scope_type: params.scope_type } : {}),
      ...(params?.mine_id != null ? { mine_id: toBig(params.mine_id) } : {}),
      ...(params?.cooperative_id != null ? { cooperative_id: toBig(params.cooperative_id) } : {}),
    },
    orderBy: [{ key: "asc" }, { scope_type: "asc" }, { version: "desc" }],
    take: params?.limit ?? 500,
  });
  return rows.map(mapRow);
}

export async function findRuleValidAt(
  key: string,
  scope: FinanceRuleScope,
  at: Date,
): Promise<FinanceRuleRow | null> {
  const row = await prisma.finance_rules.findFirst({
    where: {
      key,
      ...scopeWhere(scope),
      effective_from: { lte: at },
      OR: [{ effective_to: null }, { effective_to: { gt: at } }],
    },
    orderBy: { version: "desc" },
  });
  return row ? mapRow(row) : null;
}

export async function getNextVersion(key: string, scope: FinanceRuleScope): Promise<number> {
  const last = await prisma.finance_rules.findFirst({
    where: { key, ...scopeWhere(scope) },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (last?.version ?? 0) + 1;
}

export async function setActiveFinanceRule(params: {
  key: string;
  value: unknown;
  scope: FinanceRuleScope;
  effective_from: Date;
  effective_to?: Date | null;
  created_by: number;
}): Promise<{ activated: FinanceRuleRow; archived: FinanceRuleRow[] }> {
  return prisma.$transaction(async (tx) => {
    const sw = scopeWhere(params.scope);
    const archived: FinanceRuleRow[] = [];

    const prevActive = await tx.finance_rules.findMany({
      where: { key: params.key, ...sw, status: "ACTIVE" },
    });

    for (const prev of prevActive) {
      const updated = await tx.finance_rules.update({
        where: { id: prev.id },
        data: { status: "ARCHIVED", effective_to: params.effective_from },
      });
      archived.push(mapRow(updated));

      await tx.audit_logs.create({
        data: {
          entity_type: "finance_rule",
          entity_id: String(prev.id),
          action: "ARCHIVED",
          before_value: { status: "ACTIVE", effective_to: prev.effective_to },
          after_value: { status: "ARCHIVED", effective_to: params.effective_from },
          performed_by_user_id: toBig(params.created_by),
          reason: `superseded_by_rule_key_${params.key}`,
        },
      });
    }

    const version = await getNextVersionInTx(tx, params.key, params.scope);
    const activatedRow = await tx.finance_rules.create({
      data: {
        key: params.key,
        value: params.value as object,
        scope_type: params.scope.type,
        mine_id: params.scope.type === "MINE" ? toBig(params.scope.mine_id) : null,
        cooperative_id: params.scope.type === "COOPERATIVE" ? toBig(params.scope.cooperative_id) : null,
        effective_from: params.effective_from,
        effective_to: params.effective_to ?? null,
        status: "ACTIVE",
        version,
        created_by: toBig(params.created_by),
      },
    });

    await tx.audit_logs.create({
      data: {
        entity_type: "finance_rule",
        entity_id: String(activatedRow.id),
        action: "ACTIVATED",
        before_value: archived.length
          ? ({ archived_count: archived.length } as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        after_value: {
          key: params.key,
          value: params.value,
          scope: params.scope,
          effective_from: params.effective_from.toISOString(),
          version,
          status: "ACTIVE",
        } as Prisma.InputJsonValue,
        performed_by_user_id: toBig(params.created_by),
        reason: archived.length ? `archived_${archived.length}_previous` : "first_active",
      },
    });

    return { activated: mapRow(activatedRow), archived };
  });
}

async function getNextVersionInTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  key: string,
  scope: FinanceRuleScope,
): Promise<number> {
  const last = await tx.finance_rules.findFirst({
    where: { key, ...scopeWhere(scope) },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (last?.version ?? 0) + 1;
}
