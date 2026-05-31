import type { ApprovalStatus } from "@prisma/client";

import { prisma } from "../db/prisma";

import { toBig, toNum } from "./id";



export type FleetOwnerRow = {

  id: number;

  user_id: number;

  cooperative_id?: number;

  full_name: string;

  national_id: string;

  bank_iban?: string;

  status: ApprovalStatus;

  ownership_doc_url?: string;

  insurance_doc_url?: string;

};



function mapRow(o: {

  id: bigint;

  user_id: bigint;

  cooperative_id: bigint | null;

  full_name: string;

  national_id: string;

  bank_iban: string | null;

  status: ApprovalStatus;

  ownership_doc_url: string | null;

  insurance_doc_url: string | null;

}): FleetOwnerRow {

  return {

    id: toNum(o.id),

    user_id: toNum(o.user_id),

    cooperative_id: o.cooperative_id != null ? toNum(o.cooperative_id) : undefined,

    full_name: o.full_name,

    national_id: o.national_id,

    bank_iban: o.bank_iban ?? undefined,

    status: o.status,

    ownership_doc_url: o.ownership_doc_url ?? undefined,

    insurance_doc_url: o.insurance_doc_url ?? undefined,

  };

}



export async function listFleetOwners(): Promise<FleetOwnerRow[]> {

  const rows = await prisma.fleet_owners.findMany({ orderBy: { id: "asc" } });

  return rows.map(mapRow);

}



export async function listFleetOwnersByCooperative(cooperativeId: number): Promise<FleetOwnerRow[]> {

  const rows = await prisma.fleet_owners.findMany({

    where: { cooperative_id: toBig(cooperativeId) },

    orderBy: { id: "asc" },

  });

  return rows.map(mapRow);

}



export async function listPendingFleetOwnersByCooperative(cooperativeId: number): Promise<FleetOwnerRow[]> {
  return listFleetOwnersByCooperativeAndStatus(cooperativeId, "PENDING");
}

export async function listFleetOwnersByCooperativeAndStatus(
  cooperativeId: number,
  status: ApprovalStatus,
): Promise<FleetOwnerRow[]> {
  const rows = await prisma.fleet_owners.findMany({
    where: { cooperative_id: toBig(cooperativeId), status },
    orderBy: { id: "asc" },
  });
  return rows.map(mapRow);
}

export async function updateFleetOwnerIban(id: number, bankIban: string): Promise<FleetOwnerRow | null> {
  try {
    const o = await prisma.fleet_owners.update({
      where: { id: toBig(id) },
      data: { bank_iban: bankIban },
    });
    return mapRow(o);
  } catch {
    return null;
  }
}

export async function patchFleetOwnerKycFields(
  id: number,
  fields: {
    full_name?: string;
    bank_iban?: string;
    ownership_doc_url?: string;
    insurance_doc_url?: string;
  },
): Promise<FleetOwnerRow | null> {
  const data: Record<string, string> = {};
  if (fields.full_name != null) data.full_name = fields.full_name;
  if (fields.bank_iban != null) data.bank_iban = fields.bank_iban;
  if (fields.ownership_doc_url != null) data.ownership_doc_url = fields.ownership_doc_url;
  if (fields.insurance_doc_url != null) data.insurance_doc_url = fields.insurance_doc_url;
  if (Object.keys(data).length === 0) return findFleetOwnerById(id);
  try {
    const o = await prisma.fleet_owners.update({
      where: { id: toBig(id) },
      data: { ...data, status: "PENDING" },
    });
    return mapRow(o);
  } catch {
    return null;
  }
}



export async function findFleetOwnerByUserId(userId: number): Promise<FleetOwnerRow | null> {

  const o = await prisma.fleet_owners.findUnique({ where: { user_id: toBig(userId) } });

  return o ? mapRow(o) : null;

}



export async function findFleetOwnerById(fleetOwnerId: number): Promise<FleetOwnerRow | null> {

  const o = await prisma.fleet_owners.findUnique({ where: { id: toBig(fleetOwnerId) } });

  return o ? mapRow(o) : null;

}



export async function upsertFleetOwner(params: Omit<FleetOwnerRow, "id">): Promise<FleetOwnerRow> {

  const existing = await prisma.fleet_owners.findUnique({ where: { user_id: toBig(params.user_id) } });

  const coopId = params.cooperative_id != null ? toBig(params.cooperative_id) : null;

  if (existing) {

    const o = await prisma.fleet_owners.update({

      where: { id: existing.id },

      data: {

        cooperative_id: coopId,

        full_name: params.full_name,

        national_id: params.national_id,

        bank_iban: params.bank_iban,

        status: params.status,

        ownership_doc_url: params.ownership_doc_url,

        insurance_doc_url: params.insurance_doc_url,

      },

    });

    return mapRow(o);

  }

  const o = await prisma.fleet_owners.create({

    data: {

      user_id: toBig(params.user_id),

      cooperative_id: coopId,

      full_name: params.full_name,

      national_id: params.national_id,

      bank_iban: params.bank_iban,

      status: params.status,

      ownership_doc_url: params.ownership_doc_url,

      insurance_doc_url: params.insurance_doc_url,

    },

  });

  return mapRow(o);

}



export async function updateFleetOwnerStatus(id: number, status: ApprovalStatus): Promise<FleetOwnerRow | null> {

  try {

    const o = await prisma.fleet_owners.update({

      where: { id: toBig(id) },

      data: { status },

    });

    return mapRow(o);

  } catch {

    return null;

  }

}


