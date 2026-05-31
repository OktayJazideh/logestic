import type { HouseholdStatus } from "@prisma/client";
import { prisma } from "../db/prisma";
import { toBig, toNum } from "./id";

export type HouseholdRow = {
  id: number;
  user_id: number;
  village_id: number;
  cooperative_id?: number;
  head_name: string;
  national_id: string;
  bank_iban?: string;
  status: HouseholdStatus;
};

function mapRow(h: {
  id: bigint;
  user_id: bigint;
  village_id: bigint;
  cooperative_id: bigint | null;
  head_name: string;
  national_id: string;
  bank_iban: string | null;
  status: HouseholdStatus;
}): HouseholdRow {
  return {
    id: toNum(h.id),
    user_id: toNum(h.user_id),
    village_id: toNum(h.village_id),
    cooperative_id: h.cooperative_id != null ? toNum(h.cooperative_id) : undefined,
    head_name: h.head_name,
    national_id: h.national_id,
    bank_iban: h.bank_iban ?? undefined,
    status: h.status,
  };
}

export async function listHouseholds(): Promise<HouseholdRow[]> {
  const rows = await prisma.households.findMany({ orderBy: { id: "asc" } });
  return rows.map(mapRow);
}

export async function listHouseholdsByCooperative(cooperativeId: number): Promise<HouseholdRow[]> {
  const rows = await prisma.households.findMany({
    where: { cooperative_id: toBig(cooperativeId) },
    orderBy: { id: "asc" },
  });
  return rows.map(mapRow);
}

/** APPROVED households in villages belonging to the given mine (month-end pool snapshot). */
export async function listApprovedHouseholdIdsByMine(mineId: number): Promise<number[]> {
  const rows = await prisma.households.findMany({
    where: {
      status: "APPROVED",
      village: { mine_id: toBig(mineId) },
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return rows.map((r) => toNum(r.id));
}

export async function listPendingHouseholdsByCooperative(cooperativeId: number): Promise<HouseholdRow[]> {
  return listHouseholdsByCooperativeAndStatus(cooperativeId, "PENDING");
}

export async function listHouseholdsByCooperativeAndStatus(
  cooperativeId: number,
  status: HouseholdStatus,
): Promise<HouseholdRow[]> {
  const rows = await prisma.households.findMany({
    where: { cooperative_id: toBig(cooperativeId), status },
    orderBy: { id: "asc" },
  });
  return rows.map(mapRow);
}

export async function patchHouseholdKycFields(
  id: number,
  fields: { head_name?: string; bank_iban?: string },
): Promise<HouseholdRow | null> {
  if (!fields.head_name && !fields.bank_iban) return findHouseholdById(id);
  try {
    const h = await prisma.households.update({
      where: { id: toBig(id) },
      data: {
        ...(fields.head_name != null ? { head_name: fields.head_name } : {}),
        ...(fields.bank_iban != null ? { bank_iban: fields.bank_iban } : {}),
        status: "PENDING",
      },
    });
    return mapRow(h);
  } catch {
    return null;
  }
}

export async function findHouseholdByUserId(userId: number): Promise<HouseholdRow | null> {
  const h = await prisma.households.findUnique({ where: { user_id: toBig(userId) } });
  return h ? mapRow(h) : null;
}

export async function findHouseholdById(householdId: number): Promise<HouseholdRow | null> {
  const h = await prisma.households.findUnique({ where: { id: toBig(householdId) } });
  return h ? mapRow(h) : null;
}

export async function findHouseholdByNationalId(nationalId: string): Promise<HouseholdRow | null> {
  const h = await prisma.households.findUnique({ where: { national_id: nationalId } });
  return h ? mapRow(h) : null;
}

export async function updateHouseholdIban(
  id: number,
  bankIban: string,
): Promise<HouseholdRow | null> {
  try {
    const h = await prisma.households.update({
      where: { id: toBig(id) },
      data: { bank_iban: bankIban },
    });
    return mapRow(h);
  } catch {
    return null;
  }
}

export async function upsertHousehold(params: Omit<HouseholdRow, "id">): Promise<HouseholdRow> {
  const existing = await prisma.households.findUnique({ where: { user_id: toBig(params.user_id) } });
  const coopId = params.cooperative_id != null ? toBig(params.cooperative_id) : null;
  if (existing) {
    const h = await prisma.households.update({
      where: { id: existing.id },
      data: {
        village_id: toBig(params.village_id),
        cooperative_id: coopId,
        head_name: params.head_name,
        national_id: params.national_id,
        bank_iban: params.bank_iban,
        status: params.status,
      },
    });
    return mapRow(h);
  }
  const h = await prisma.households.create({
    data: {
      user_id: toBig(params.user_id),
      village_id: toBig(params.village_id),
      cooperative_id: coopId,
      head_name: params.head_name,
      national_id: params.national_id,
      bank_iban: params.bank_iban,
      status: params.status,
    },
  });
  return mapRow(h);
}

export type CreateImportedHouseholdParams = {
  user_id: number;
  village_id: number;
  cooperative_id: number;
  head_name: string;
  national_id: string;
  status: HouseholdStatus;
};

/** Create household for bulk import; returns null if national_id already exists. */
export async function createImportedHousehold(
  params: CreateImportedHouseholdParams,
): Promise<HouseholdRow | null> {
  const existingNational = await prisma.households.findUnique({
    where: { national_id: params.national_id },
  });
  if (existingNational) return null;

  const existingUser = await prisma.households.findUnique({
    where: { user_id: toBig(params.user_id) },
  });
  if (existingUser) return null;

  const h = await prisma.households.create({
    data: {
      user_id: toBig(params.user_id),
      village_id: toBig(params.village_id),
      cooperative_id: toBig(params.cooperative_id),
      head_name: params.head_name,
      national_id: params.national_id,
      status: params.status,
    },
  });
  return mapRow(h);
}

export async function updateHouseholdStatus(id: number, status: HouseholdStatus): Promise<HouseholdRow | null> {
  try {
    const h = await prisma.households.update({
      where: { id: toBig(id) },
      data: { status },
    });
    return mapRow(h);
  } catch {
    return null;
  }
}
