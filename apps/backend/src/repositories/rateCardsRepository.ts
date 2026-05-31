import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { toBig, toNum } from "./id";

export type RateCardOperationType = "TONNAGE" | "HOURLY";
export type RateCardStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type RateCardUnitType = "TON" | "HOUR";

export type RateCardRow = {
  id: number;
  mine_id: number;
  cooperative_id?: number;
  operation_type: RateCardOperationType;
  material_type: string;
  unit_type: RateCardUnitType;
  rate: number;
  effective_from: Date;
  effective_to?: Date;
  status: RateCardStatus;
  created_by?: number;
  created_at: Date;
};

/** Legacy MVP shape for listRateCards cache */
export type RateCardMvp = {
  id: number;
  mine_id: number;
  cooperative_id?: number;
  operation_type: RateCardOperationType;
  material_type: string;
  unit_type: RateCardUnitType;
  rate: number;
  effectiveFrom: string;
  effectiveTo?: string;
  status: RateCardStatus;
};

export const HOURLY_MATERIAL_TYPE = "HOURLY";

function mapRow(r: {
  id: bigint;
  mine_id: bigint;
  cooperative_id: bigint | null;
  operation_type: string;
  material_type: string;
  unit_type: string;
  rate: Prisma.Decimal;
  effective_from: Date;
  effective_to: Date | null;
  status: string;
  created_by: bigint | null;
  created_at: Date;
}): RateCardRow {
  return {
    id: toNum(r.id),
    mine_id: toNum(r.mine_id),
    cooperative_id: r.cooperative_id != null ? toNum(r.cooperative_id) : undefined,
    operation_type: r.operation_type as RateCardOperationType,
    material_type: r.material_type,
    unit_type: r.unit_type as RateCardUnitType,
    rate: Number(r.rate),
    effective_from: r.effective_from,
    effective_to: r.effective_to ?? undefined,
    status: r.status as RateCardStatus,
    created_by: r.created_by != null ? toNum(r.created_by) : undefined,
    created_at: r.created_at,
  };
}

export function toMvp(row: RateCardRow): RateCardMvp {
  return {
    id: row.id,
    mine_id: row.mine_id,
    cooperative_id: row.cooperative_id,
    operation_type: row.operation_type,
    material_type: row.material_type,
    unit_type: row.unit_type,
    rate: row.rate,
    effectiveFrom: row.effective_from.toISOString().slice(0, 10),
    effectiveTo: row.effective_to?.toISOString().slice(0, 10),
    status: row.status,
  };
}

function dateRangeFilter(at: Date) {
  return {
    effective_from: { lte: at },
    OR: [{ effective_to: null }, { effective_to: { gt: at } }],
  };
}

function validAtFilter(at: Date, activeOnly = true) {
  return {
    ...dateRangeFilter(at),
    ...(activeOnly ? { status: "ACTIVE" as const } : { status: { not: "DRAFT" as const } }),
  };
}

export async function listValidRateCards(params: {
  mine_id?: number;
  cooperative_id?: number;
  date?: Date;
}): Promise<RateCardRow[]> {
  const at = params.date ?? new Date();
  const rows = await prisma.rate_cards.findMany({
    where: {
      ...validAtFilter(at, false),
      ...(params.mine_id != null ? { mine_id: toBig(params.mine_id) } : {}),
      ...(params.cooperative_id != null ? { cooperative_id: toBig(params.cooperative_id) } : {}),
    },
    orderBy: [{ mine_id: "asc" }, { operation_type: "asc" }, { material_type: "asc" }],
  });
  return rows.map(mapRow);
}

export async function listActiveRateCards(now = new Date()): Promise<RateCardMvp[]> {
  const rows = await listValidRateCards({ date: now });
  return rows.map(toMvp);
}

export async function getActiveHourlyRateCard(mineId: number, now = new Date()): Promise<RateCardRow | null> {
  return getActiveRateCard(mineId, "HOURLY", HOURLY_MATERIAL_TYPE, now);
}

export async function getActiveRateCard(
  mineId: number,
  operation_type: RateCardOperationType,
  material_type: string,
  now = new Date(),
): Promise<RateCardRow | null> {
  return getRateCardValidAt(mineId, operation_type, material_type, now, false);
}

/** Rate valid at a point in time (includes ARCHIVED rows with open-ended or future effective_to). */
export async function getRateCardValidAt(
  mineId: number,
  operation_type: RateCardOperationType,
  material_type: string,
  at: Date,
  activeOnly = false,
): Promise<RateCardRow | null> {
  const row = await prisma.rate_cards.findFirst({
    where: {
      mine_id: toBig(mineId),
      operation_type,
      material_type,
      ...validAtFilter(at, activeOnly),
    },
    orderBy: { effective_from: "desc" },
  });
  return row ? mapRow(row) : null;
}

export async function getRateCardById(id: number): Promise<RateCardRow | null> {
  const row = await prisma.rate_cards.findUnique({ where: { id: toBig(id) } });
  return row ? mapRow(row) : null;
}

export async function createDraftRateCard(params: {
  mine_id: number;
  cooperative_id?: number;
  operation_type: RateCardOperationType;
  material_type: string;
  unit_type: RateCardUnitType;
  rate: number;
  effective_from: Date;
  created_by?: number;
}): Promise<RateCardRow> {
  const row = await prisma.rate_cards.create({
    data: {
      mine_id: toBig(params.mine_id),
      cooperative_id: params.cooperative_id != null ? toBig(params.cooperative_id) : null,
      operation_type: params.operation_type,
      material_type: params.material_type,
      unit_type: params.unit_type,
      rate: new Prisma.Decimal(params.rate),
      effective_from: params.effective_from,
      status: "DRAFT",
      created_by: params.created_by != null ? toBig(params.created_by) : null,
    },
  });
  return mapRow(row);
}

export async function activateRateCard(
  id: number,
  performed_by_user_id: number,
): Promise<{ activated: RateCardRow; archived: RateCardRow[] }> {
  return prisma.$transaction(async (tx) => {
    const draft = await tx.rate_cards.findUnique({ where: { id: toBig(id) } });
    if (!draft) throw new Error("rate_card_not_found");
    if (draft.status !== "DRAFT") throw new Error("not_draft");

    const effectiveFrom = draft.effective_from;
    const archived: RateCardRow[] = [];

    const prevActive = await tx.rate_cards.findMany({
      where: {
        mine_id: draft.mine_id,
        operation_type: draft.operation_type,
        material_type: draft.material_type,
        status: "ACTIVE",
        id: { not: draft.id },
        ...(draft.cooperative_id != null ? { cooperative_id: draft.cooperative_id } : { cooperative_id: null }),
      },
    });

    for (const prev of prevActive) {
      const updated = await tx.rate_cards.update({
        where: { id: prev.id },
        data: {
          status: "ARCHIVED",
          effective_to: effectiveFrom,
        },
      });
      archived.push(mapRow(updated));

      await tx.audit_logs.create({
        data: {
          entity_type: "rate_card",
          entity_id: String(prev.id),
          action: "ARCHIVED",
          before_value: { status: "ACTIVE", effective_to: prev.effective_to },
          after_value: { status: "ARCHIVED", effective_to: effectiveFrom },
          performed_by_user_id: toBig(performed_by_user_id),
          reason: `superseded_by_rate_card_${id}`,
        },
      });
    }

    const activatedRow = await tx.rate_cards.update({
      where: { id: draft.id },
      data: { status: "ACTIVE" },
    });

    await tx.audit_logs.create({
      data: {
        entity_type: "rate_card",
        entity_id: String(id),
        action: "ACTIVATED",
        before_value: { status: "DRAFT" },
        after_value: { status: "ACTIVE", effective_from: effectiveFrom },
        performed_by_user_id: toBig(performed_by_user_id),
        reason: archived.length ? `archived_${archived.length}_previous` : "first_active",
      },
    });

    return { activated: mapRow(activatedRow), archived };
  });
}

export async function listRateCardRows(): Promise<RateCardRow[]> {
  const rows = await prisma.rate_cards.findMany({ orderBy: { id: "asc" } });
  return rows.map(mapRow);
}

/** Seed helper: create and immediately activate (archives prior ACTIVE). */
export async function seedActiveRateCard(params: {
  mine_id: number;
  cooperative_id?: number;
  operation_type: RateCardOperationType;
  material_type: string;
  unit_type: RateCardUnitType;
  rate: number;
  effective_from: Date;
  effective_to?: Date;
  created_by?: number;
}): Promise<RateCardRow> {
  const draft = await createDraftRateCard(params);
  const { activated } = await activateRateCard(draft.id, params.created_by ?? 1);
  if (params.effective_to) {
    const row = await prisma.rate_cards.update({
      where: { id: toBig(activated.id) },
      data: { effective_to: params.effective_to, status: "ARCHIVED" },
    });
    return mapRow(row);
  }
  return activated;
}

/** @deprecated use createDraftRateCard + activateRateCard */
export async function upsertRateCard(params: {
  mine_id: number;
  material_type: string;
  rate_per_ton: number;
  valid_from: Date;
  valid_to?: Date;
}): Promise<RateCardRow> {
  const op: RateCardOperationType = params.material_type === HOURLY_MATERIAL_TYPE ? "HOURLY" : "TONNAGE";
  const unit: RateCardUnitType = op === "HOURLY" ? "HOUR" : "TON";
  return seedActiveRateCard({
    mine_id: params.mine_id,
    operation_type: op,
    material_type: params.material_type,
    unit_type: unit,
    rate: params.rate_per_ton,
    effective_from: params.valid_from,
    effective_to: params.valid_to,
  });
}
