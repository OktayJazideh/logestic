import type { OperationNeedStatus, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { resolveOperationTypeDualWrite, type LegacyOperationType } from "../lib/operationTypeResolve";
import { toBig, toNum } from "./id";

type Tx = Prisma.TransactionClient;

export type OperationNeedRow = {
  id: number;
  mine_id: number;
  employer_user_id: number;
  village_id: number;
  material_type: string;
  quantity_tons: number | null;
  equipment_type?: string;
  location_text?: string;
  estimated_hours?: number | null;
  operation_type: LegacyOperationType;
  operation_type_id: string;
  operation_type_code?: string;
  operation_type_name_fa?: string;
  note?: string;
  status: OperationNeedStatus;
  created_at: Date;
};

const needInclude = {
  operation_type_catalog: {
    select: { id: true, code: true, name_fa: true },
  },
} as const;

type NeedDbRow = {
  id: bigint;
  mine_id: bigint;
  employer_user_id: bigint;
  village_id: bigint;
  material_type: string;
  quantity_tons: { toNumber(): number } | number | string | null;
  equipment_type: string | null;
  location_text: string | null;
  estimated_hours: { toNumber(): number } | number | string | null;
  operation_type: string;
  operation_type_id: string | null;
  note: string | null;
  status: OperationNeedStatus;
  created_at: Date;
  operation_type_catalog?: { id: string; code: string; name_fa: string } | null;
};

function toOptionalNumber(
  value: { toNumber(): number } | number | string | null | undefined,
): number | null {
  if (value == null) return null;
  if (typeof value === "object" && "toNumber" in value) return value.toNumber();
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapRow(r: NeedDbRow): OperationNeedRow {
  return {
    id: toNum(r.id),
    mine_id: toNum(r.mine_id),
    employer_user_id: toNum(r.employer_user_id),
    village_id: toNum(r.village_id),
    material_type: r.material_type,
    quantity_tons: toOptionalNumber(r.quantity_tons),
    equipment_type: r.equipment_type ?? undefined,
    location_text: r.location_text ?? undefined,
    estimated_hours: toOptionalNumber(r.estimated_hours),
    operation_type: (r.operation_type === "HOURLY" ? "HOURLY" : "TONNAGE") as LegacyOperationType,
    operation_type_id: r.operation_type_id ?? r.operation_type_catalog?.id ?? "",
    operation_type_code: r.operation_type_catalog?.code,
    operation_type_name_fa: r.operation_type_catalog?.name_fa,
    note: r.note ?? undefined,
    status: r.status,
    created_at: r.created_at,
  };
}

export async function createOperationNeed(data: {
  mine_id: number;
  employer_user_id: number;
  village_id: number;
  material_type: string;
  quantity_tons?: number | null;
  equipment_type?: string;
  location_text?: string;
  estimated_hours?: number | null;
  note?: string;
  operation_type_id?: string;
  operation_type?: LegacyOperationType;
}): Promise<OperationNeedRow> {
  const resolved = await resolveOperationTypeDualWrite({
    operation_type_id: data.operation_type_id,
    operation_type: data.operation_type,
  });

  const row = await prisma.operation_needs.create({
    data: {
      mine_id: toBig(data.mine_id),
      employer_user_id: toBig(data.employer_user_id),
      village_id: toBig(data.village_id),
      material_type: data.material_type,
      quantity_tons: data.quantity_tons ?? null,
      equipment_type: data.equipment_type ?? null,
      location_text: data.location_text ?? null,
      estimated_hours: data.estimated_hours ?? null,
      operation_type: resolved.operation_type,
      operation_type_id: resolved.operation_type_id,
      note: data.note,
      status: "PENDING",
    },
    include: needInclude,
  });
  return mapRow(row);
}

export async function getOperationNeed(id: number, tx?: Tx): Promise<OperationNeedRow | null> {
  const db = tx ?? prisma;
  const row = await db.operation_needs.findUnique({
    where: { id: toBig(id) },
    include: needInclude,
  });
  return row ? mapRow(row) : null;
}

export async function markOperationNeedDispatched(id: number, tx: Tx): Promise<OperationNeedRow> {
  const row = await tx.operation_needs.update({
    where: { id: toBig(id) },
    data: { status: "DISPATCHED" },
    include: needInclude,
  });
  return mapRow(row);
}

export async function listOperationNeedsByEmployer(employerUserId: number): Promise<OperationNeedRow[]> {
  const rows = await prisma.operation_needs.findMany({
    where: { employer_user_id: toBig(employerUserId) },
    orderBy: { created_at: "desc" },
    include: needInclude,
  });
  return rows.map(mapRow);
}

export async function listAllOperationNeeds(): Promise<OperationNeedRow[]> {
  const rows = await prisma.operation_needs.findMany({
    orderBy: { created_at: "desc" },
    include: needInclude,
  });
  return rows.map(mapRow);
}

export async function cancelOperationNeed(id: number): Promise<OperationNeedRow | null> {
  try {
    const row = await prisma.operation_needs.update({
      where: { id: toBig(id) },
      data: { status: "CANCELLED" },
      include: needInclude,
    });
    return mapRow(row);
  } catch {
    return null;
  }
}

/** REDISPATCH-1 — reopen a dispatched need for emergency re-dispatch. */
export async function reopenOperationNeedForRedispatch(id: number, tx?: Tx): Promise<OperationNeedRow | null> {
  const db = tx ?? prisma;
  try {
    const existing = await db.operation_needs.findUnique({ where: { id: toBig(id) } });
    if (!existing || existing.status === "CANCELLED") return null;
    const row = await db.operation_needs.update({
      where: { id: toBig(id) },
      data: { status: "PENDING" },
      include: needInclude,
    });
    return mapRow(row);
  } catch {
    return null;
  }
}
