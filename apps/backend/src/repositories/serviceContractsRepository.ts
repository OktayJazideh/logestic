import { Prisma, ServiceContractStatus, ServiceContractUnit } from "@prisma/client";
import { prisma } from "../db/prisma";
import * as rateCardsRepo from "./rateCardsRepository";
import { toBig, toNum } from "./id";

export type ServiceContractOperationCode =
  | "HAUL_TONNAGE"
  | "WATER_LITER"
  | "FOOD_COUNT"
  | "WASTE_TON"
  | "EQUIPMENT_HOUR";

export type ServiceContractRow = {
  id: number;
  mine_id: number;
  cooperative_id: number;
  operation_type_code: ServiceContractOperationCode;
  unit: ServiceContractUnit;
  base_rate_rial: number;
  fixed_community_amount_rial_per_unit: number;
  rate_card_id?: number;
  valid_from: Date;
  valid_to?: Date;
  contract_version: number;
  amendment_ref?: string;
  status: ServiceContractStatus;
  signed_at_mine?: Date;
  signed_at_coop?: Date;
  created_by?: number;
  created_at: Date;
  updated_at: Date;
};

function mapRow(r: {
  id: bigint;
  mine_id: bigint;
  cooperative_id: bigint;
  operation_type_code: string;
  unit: ServiceContractUnit;
  base_rate_rial: Prisma.Decimal;
  fixed_community_amount_rial_per_unit: Prisma.Decimal;
  rate_card_id: bigint | null;
  valid_from: Date;
  valid_to: Date | null;
  contract_version: number;
  amendment_ref: string | null;
  status: ServiceContractStatus;
  signed_at_mine: Date | null;
  signed_at_coop: Date | null;
  created_by: bigint | null;
  created_at: Date;
  updated_at: Date;
}): ServiceContractRow {
  return {
    id: toNum(r.id),
    mine_id: toNum(r.mine_id),
    cooperative_id: toNum(r.cooperative_id),
    operation_type_code: r.operation_type_code as ServiceContractOperationCode,
    unit: r.unit,
    base_rate_rial: Number(r.base_rate_rial),
    fixed_community_amount_rial_per_unit: Number(r.fixed_community_amount_rial_per_unit),
    rate_card_id: r.rate_card_id != null ? toNum(r.rate_card_id) : undefined,
    valid_from: r.valid_from,
    valid_to: r.valid_to ?? undefined,
    contract_version: r.contract_version,
    amendment_ref: r.amendment_ref ?? undefined,
    status: r.status,
    signed_at_mine: r.signed_at_mine ?? undefined,
    signed_at_coop: r.signed_at_coop ?? undefined,
    created_by: r.created_by != null ? toNum(r.created_by) : undefined,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/** UI badge: ACTIVE | DRAFT | EXPIRED (SUPERSEDED → EXPIRED). */
export function displayContractStatus(row: ServiceContractRow, at: Date = new Date()): "ACTIVE" | "DRAFT" | "EXPIRED" {
  if (row.status === "DRAFT") return "DRAFT";
  if (row.status === "ACTIVE") {
    if (row.valid_to != null && row.valid_to <= at) return "EXPIRED";
    return "ACTIVE";
  }
  return "EXPIRED";
}

export function toApi(row: ServiceContractRow, at?: Date) {
  return {
    id: row.id,
    mine_id: row.mine_id,
    cooperative_id: row.cooperative_id,
    operation_type_code: row.operation_type_code,
    unit: row.unit,
    base_rate_rial: row.base_rate_rial,
    fixed_community_amount_rial_per_unit: row.fixed_community_amount_rial_per_unit,
    rate_card_id: row.rate_card_id,
    valid_from: row.valid_from.toISOString(),
    valid_to: row.valid_to?.toISOString(),
    contract_version: row.contract_version,
    amendment_ref: row.amendment_ref,
    status: row.status,
    display_status: displayContractStatus(row, at),
    signed_at_mine: row.signed_at_mine?.toISOString(),
    signed_at_coop: row.signed_at_coop?.toISOString(),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export async function listServiceContractVersions(params: {
  mine_id: number;
  cooperative_id: number;
  operation_type_code: string;
}): Promise<ServiceContractRow[]> {
  const rows = await prisma.service_contracts.findMany({
    where: {
      mine_id: toBig(params.mine_id),
      cooperative_id: toBig(params.cooperative_id),
      operation_type_code: params.operation_type_code,
    },
    orderBy: [{ contract_version: "desc" }, { id: "desc" }],
  });
  return rows.map(mapRow);
}

function validAtFilter(at: Date) {
  return {
    valid_from: { lte: at },
    OR: [{ valid_to: null }, { valid_to: { gt: at } }],
  };
}

export async function getServiceContractById(id: number): Promise<ServiceContractRow | null> {
  const row = await prisma.service_contracts.findUnique({ where: { id: toBig(id) } });
  return row ? mapRow(row) : null;
}

export async function findActiveServiceContract(params: {
  mine_id: number;
  cooperative_id: number;
  operation_type_code: string;
  at?: Date;
}): Promise<ServiceContractRow | null> {
  const at = params.at ?? new Date();
  const row = await prisma.service_contracts.findFirst({
    where: {
      mine_id: toBig(params.mine_id),
      cooperative_id: toBig(params.cooperative_id),
      operation_type_code: params.operation_type_code,
      status: "ACTIVE",
      ...validAtFilter(at),
    },
    orderBy: { contract_version: "desc" },
  });
  return row ? mapRow(row) : null;
}

export async function createDraftServiceContract(params: {
  mine_id: number;
  cooperative_id: number;
  operation_type_code: ServiceContractOperationCode;
  unit: ServiceContractUnit;
  base_rate_rial: number;
  fixed_community_amount_rial_per_unit: number;
  rate_card_id?: number;
  valid_from: Date;
  valid_to?: Date;
  contract_version?: number;
  amendment_ref?: string;
  created_by?: number;
}): Promise<ServiceContractRow> {
  const row = await prisma.service_contracts.create({
    data: {
      mine_id: toBig(params.mine_id),
      cooperative_id: toBig(params.cooperative_id),
      operation_type_code: params.operation_type_code,
      unit: params.unit,
      base_rate_rial: new Prisma.Decimal(params.base_rate_rial),
      fixed_community_amount_rial_per_unit: new Prisma.Decimal(params.fixed_community_amount_rial_per_unit),
      rate_card_id: params.rate_card_id != null ? toBig(params.rate_card_id) : null,
      valid_from: params.valid_from,
      valid_to: params.valid_to ?? null,
      contract_version: params.contract_version ?? 1,
      amendment_ref: params.amendment_ref ?? null,
      status: "DRAFT",
      created_by: params.created_by != null ? toBig(params.created_by) : null,
    },
  });
  return mapRow(row);
}

export async function updateDraftServiceContract(
  id: number,
  patch: Partial<{
    base_rate_rial: number;
    fixed_community_amount_rial_per_unit: number;
    rate_card_id: number | null;
    valid_from: Date;
    valid_to: Date | null;
    signed_at_mine: Date | null;
    signed_at_coop: Date | null;
  }>,
): Promise<ServiceContractRow> {
  const existing = await prisma.service_contracts.findUnique({ where: { id: toBig(id) } });
  if (!existing) throw new Error("service_contract_not_found");
  if (existing.status !== "DRAFT") throw new Error("not_draft");

  const data: Prisma.service_contractsUpdateInput = {};
  if (patch.base_rate_rial != null) data.base_rate_rial = new Prisma.Decimal(patch.base_rate_rial);
  if (patch.fixed_community_amount_rial_per_unit != null) {
    data.fixed_community_amount_rial_per_unit = new Prisma.Decimal(patch.fixed_community_amount_rial_per_unit);
  }
  if (patch.rate_card_id !== undefined) {
    data.rate_card = patch.rate_card_id != null ? { connect: { id: toBig(patch.rate_card_id) } } : { disconnect: true };
  }
  if (patch.valid_from != null) data.valid_from = patch.valid_from;
  if (patch.valid_to !== undefined) data.valid_to = patch.valid_to;
  if (patch.signed_at_mine !== undefined) data.signed_at_mine = patch.signed_at_mine;
  if (patch.signed_at_coop !== undefined) data.signed_at_coop = patch.signed_at_coop;

  const row = await prisma.service_contracts.update({ where: { id: toBig(id) }, data });
  return mapRow(row);
}

export async function assertLinkedRateCardForContract(
  rate_card_id: number,
  mine_id: number,
  cooperative_id: number,
  at: Date,
  exclude_contract_id?: number,
): Promise<void> {
  const card = await rateCardsRepo.getRateCardById(rate_card_id);
  if (!card) throw new Error("rate_card_not_found");
  if (card.mine_id !== mine_id) throw new Error("rate_card_mine_mismatch");
  if (card.status !== "ACTIVE") throw new Error("rate_card_not_active");
  if (card.effective_from > at || (card.effective_to != null && card.effective_to <= at)) {
    throw new Error("rate_card_not_valid_at");
  }
  if (card.cooperative_id != null && card.cooperative_id !== cooperative_id) {
    throw new Error("rate_card_coop_mismatch");
  }

  const other = await prisma.service_contracts.findFirst({
    where: {
      rate_card_id: toBig(rate_card_id),
      status: "ACTIVE",
      ...(exclude_contract_id != null ? { id: { not: toBig(exclude_contract_id) } } : {}),
    },
  });
  if (other) throw new Error("rate_card_already_linked_active_contract");
}

export async function activateServiceContract(
  id: number,
  performed_by_user_id: number,
): Promise<{ activated: ServiceContractRow; superseded: ServiceContractRow | null }> {
  return prisma.$transaction(async (tx) => {
    const draft = await tx.service_contracts.findUnique({ where: { id: toBig(id) } });
    if (!draft) throw new Error("service_contract_not_found");
    if (draft.status !== "DRAFT") throw new Error("not_draft");
    if (!draft.signed_at_mine || !draft.signed_at_coop) {
      throw new Error("dual_signature_required");
    }

    const at = draft.valid_from;
    if (draft.rate_card_id != null) {
      await assertLinkedRateCardForContract(
        toNum(draft.rate_card_id),
        toNum(draft.mine_id),
        toNum(draft.cooperative_id),
        at,
        toNum(draft.id),
      );
    }

    const prevActive = await tx.service_contracts.findFirst({
      where: {
        mine_id: draft.mine_id,
        cooperative_id: draft.cooperative_id,
        operation_type_code: draft.operation_type_code,
        status: "ACTIVE",
        id: { not: draft.id },
      },
    });

    let superseded: ServiceContractRow | null = null;
    if (prevActive) {
      const updated = await tx.service_contracts.update({
        where: { id: prevActive.id },
        data: { status: "SUPERSEDED", valid_to: draft.valid_from },
      });
      superseded = mapRow(updated);
      await tx.audit_logs.create({
        data: {
          entity_type: "service_contract",
          entity_id: String(prevActive.id),
          action: "SUPERSEDED",
          before_value: { status: "ACTIVE", contract_version: prevActive.contract_version },
          after_value: { status: "SUPERSEDED", valid_to: draft.valid_from },
          performed_by_user_id: toBig(performed_by_user_id),
          reason: `superseded_by_contract_${id}`,
        },
      });
    }

    const activatedRow = await tx.service_contracts.update({
      where: { id: draft.id },
      data: { status: "ACTIVE" },
    });

    await tx.audit_logs.create({
      data: {
        entity_type: "service_contract",
        entity_id: String(id),
        action: "ACTIVATED",
        before_value: { status: "DRAFT", contract_version: draft.contract_version },
        after_value: { status: "ACTIVE", contract_version: draft.contract_version },
        performed_by_user_id: toBig(performed_by_user_id),
        reason: prevActive ? "replaced_active" : "first_active",
      },
    });

    return { activated: mapRow(activatedRow), superseded };
  });
}

/**
 * New contract version (الحاقیه): creates DRAFT v+1 without superseding ACTIVE.
 * If new valid_from overlaps current ACTIVE window, sets ACTIVE.valid_to = now.
 */
export async function createNewServiceContractVersion(params: {
  source_id: number;
  amendment_ref: string;
  valid_from: Date;
  base_rate_rial: number;
  fixed_community_amount_rial_per_unit: number;
  rate_card_id?: number | null;
  performed_by_user_id: number;
}): Promise<{ draft: ServiceContractRow; previous_active_adjusted: ServiceContractRow | null }> {
  return prisma.$transaction(async (tx) => {
    const source = await tx.service_contracts.findUnique({ where: { id: toBig(params.source_id) } });
    if (!source) throw new Error("service_contract_not_found");
    if (source.status !== "ACTIVE") throw new Error("not_active");

    const existingDraft = await tx.service_contracts.findFirst({
      where: {
        mine_id: source.mine_id,
        cooperative_id: source.cooperative_id,
        operation_type_code: source.operation_type_code,
        status: "DRAFT",
      },
    });
    if (existingDraft) throw new Error("draft_already_exists");

    const maxVer = await tx.service_contracts.aggregate({
      where: {
        mine_id: source.mine_id,
        cooperative_id: source.cooperative_id,
        operation_type_code: source.operation_type_code,
      },
      _max: { contract_version: true },
    });
    const nextVersion = (maxVer._max.contract_version ?? source.contract_version) + 1;

    const now = new Date();
    const overlaps =
      params.valid_from <= now &&
      source.valid_from <= now &&
      (source.valid_to == null || source.valid_to > now);

    let previousActiveAdjusted: ServiceContractRow | null = null;
    if (overlaps) {
      const adjusted = await tx.service_contracts.update({
        where: { id: source.id },
        data: { valid_to: now },
      });
      previousActiveAdjusted = mapRow(adjusted);
      await tx.audit_logs.create({
        data: {
          entity_type: "service_contract",
          entity_id: String(source.id),
          action: "VERSION_OVERLAP_VALID_TO",
          before_value: { valid_to: source.valid_to },
          after_value: { valid_to: now, amendment_ref: params.amendment_ref },
          performed_by_user_id: toBig(params.performed_by_user_id),
          reason: params.amendment_ref,
        },
      });
    }

    const draftRow = await tx.service_contracts.create({
      data: {
        mine_id: source.mine_id,
        cooperative_id: source.cooperative_id,
        operation_type_code: source.operation_type_code,
        unit: source.unit,
        base_rate_rial: new Prisma.Decimal(params.base_rate_rial),
        fixed_community_amount_rial_per_unit: new Prisma.Decimal(params.fixed_community_amount_rial_per_unit),
        rate_card_id:
          params.rate_card_id !== undefined
            ? params.rate_card_id != null
              ? toBig(params.rate_card_id)
              : null
            : source.rate_card_id,
        valid_from: params.valid_from,
        contract_version: nextVersion,
        amendment_ref: params.amendment_ref,
        status: "DRAFT",
        created_by: toBig(params.performed_by_user_id),
      },
    });

    await tx.audit_logs.create({
      data: {
        entity_type: "service_contract",
        entity_id: String(draftRow.id),
        action: "NEW_VERSION_DRAFT_CREATED",
        before_value: { source_id: params.source_id, contract_version: source.contract_version },
        after_value: {
          contract_version: draftRow.contract_version,
          amendment_ref: params.amendment_ref,
          base_rate_rial: params.base_rate_rial,
          fixed_community_amount_rial_per_unit: params.fixed_community_amount_rial_per_unit,
        },
        performed_by_user_id: toBig(params.performed_by_user_id),
        reason: params.amendment_ref,
      },
    });

    return { draft: mapRow(draftRow), previous_active_adjusted: previousActiveAdjusted };
  });
}

/** Amendment: supersede ACTIVE, create DRAFT v+1 (requires contract:amend). */
export async function amendServiceContract(params: {
  active_id: number;
  amendment_ref: string;
  fixed_community_amount_rial_per_unit?: number;
  base_rate_rial?: number;
  rate_card_id?: number | null;
  valid_from: Date;
  performed_by_user_id: number;
}): Promise<{ superseded: ServiceContractRow; draft: ServiceContractRow }> {
  return prisma.$transaction(async (tx) => {
    const active = await tx.service_contracts.findUnique({ where: { id: toBig(params.active_id) } });
    if (!active) throw new Error("service_contract_not_found");
    if (active.status !== "ACTIVE") throw new Error("not_active");

    const supersededRow = await tx.service_contracts.update({
      where: { id: active.id },
      data: { status: "SUPERSEDED", valid_to: params.valid_from },
    });

    await tx.audit_logs.create({
      data: {
        entity_type: "service_contract",
        entity_id: String(active.id),
        action: "AMENDMENT_SUPERSEDED",
        before_value: {
          status: "ACTIVE",
          contract_version: active.contract_version,
          fixed_community_amount_rial_per_unit: active.fixed_community_amount_rial_per_unit,
        },
        after_value: { status: "SUPERSEDED", valid_to: params.valid_from, amendment_ref: params.amendment_ref },
        performed_by_user_id: toBig(params.performed_by_user_id),
        reason: params.amendment_ref,
      },
    });

    const draftRow = await tx.service_contracts.create({
      data: {
        mine_id: active.mine_id,
        cooperative_id: active.cooperative_id,
        operation_type_code: active.operation_type_code,
        unit: active.unit,
        base_rate_rial:
          params.base_rate_rial != null
            ? new Prisma.Decimal(params.base_rate_rial)
            : active.base_rate_rial,
        fixed_community_amount_rial_per_unit:
          params.fixed_community_amount_rial_per_unit != null
            ? new Prisma.Decimal(params.fixed_community_amount_rial_per_unit)
            : active.fixed_community_amount_rial_per_unit,
        rate_card_id:
          params.rate_card_id !== undefined
            ? params.rate_card_id != null
              ? toBig(params.rate_card_id)
              : null
            : active.rate_card_id,
        valid_from: params.valid_from,
        contract_version: active.contract_version + 1,
        amendment_ref: params.amendment_ref,
        status: "DRAFT",
        created_by: toBig(params.performed_by_user_id),
      },
    });

    await tx.audit_logs.create({
      data: {
        entity_type: "service_contract",
        entity_id: String(draftRow.id),
        action: "AMENDMENT_DRAFT_CREATED",
        before_value: Prisma.DbNull,
        after_value: {
          contract_version: draftRow.contract_version,
          amendment_ref: params.amendment_ref,
          fixed_community_amount_rial_per_unit: draftRow.fixed_community_amount_rial_per_unit,
        },
        performed_by_user_id: toBig(params.performed_by_user_id),
        reason: params.amendment_ref,
      },
    });

    return { superseded: mapRow(supersededRow), draft: mapRow(draftRow) };
  });
}

export async function deleteContractsForMine(mine_id: number): Promise<void> {
  await prisma.service_contracts.deleteMany({ where: { mine_id: toBig(mine_id) } });
}
