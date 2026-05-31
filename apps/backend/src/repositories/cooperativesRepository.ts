import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { toBig, toNum } from "./id";

export type CooperativeStatus = "PENDING_KYC" | "PENDING" | "ACTIVE" | "SUSPENDED";

export type CooperativeRow = {
  id: number;
  mine_id: number;
  name: string;
  national_id?: string;
  registration_number?: string;
  charter_file_url?: string;
  ceo_name?: string;
  board_members?: unknown;
  activity_scope?: string;
  geo_area?: string;
  iban?: string;
  settings_json?: unknown;
  status: CooperativeStatus;
  created_at: Date;
};

function mapCooperative(c: {
  id: bigint;
  mine_id: bigint;
  name: string;
  national_id: string | null;
  registration_number: string | null;
  charter_file_url: string | null;
  ceo_name: string | null;
  board_members: Prisma.JsonValue | null;
  activity_scope: string | null;
  geo_area: string | null;
  iban: string | null;
  settings_json: Prisma.JsonValue | null;
  status: CooperativeStatus;
  created_at: Date;
}): CooperativeRow {
  return {
    id: toNum(c.id),
    mine_id: toNum(c.mine_id),
    name: c.name,
    national_id: c.national_id ?? undefined,
    registration_number: c.registration_number ?? undefined,
    charter_file_url: c.charter_file_url ?? undefined,
    ceo_name: c.ceo_name ?? undefined,
    board_members: c.board_members ?? undefined,
    activity_scope: c.activity_scope ?? undefined,
    geo_area: c.geo_area ?? undefined,
    iban: c.iban ?? undefined,
    settings_json: c.settings_json ?? undefined,
    status: c.status,
    created_at: c.created_at,
  };
}

export async function findCooperativeById(id: number): Promise<CooperativeRow | null> {
  const c = await prisma.cooperatives.findUnique({ where: { id: toBig(id) } });
  return c ? mapCooperative(c) : null;
}

export async function listCooperatives(): Promise<CooperativeRow[]> {
  const rows = await prisma.cooperatives.findMany({ orderBy: { id: "asc" } });
  return rows.map(mapCooperative);
}

export async function listCooperativesByMine(mineId: number): Promise<CooperativeRow[]> {
  const rows = await prisma.cooperatives.findMany({
    where: { mine_id: toBig(mineId) },
    orderBy: { id: "asc" },
  });
  return rows.map(mapCooperative);
}

export type CreateCooperativeInput = {
  mine_id: number;
  name: string;
  national_id?: string;
  registration_number?: string;
  charter_file_url?: string;
  ceo_name?: string;
  board_members?: unknown;
  activity_scope?: string;
  geo_area?: string;
  iban?: string;
};

export async function createCooperative(data: CreateCooperativeInput): Promise<CooperativeRow> {
  const c = await prisma.cooperatives.create({
    data: {
      mine_id: toBig(data.mine_id),
      name: data.name,
      national_id: data.national_id,
      registration_number: data.registration_number,
      charter_file_url: data.charter_file_url,
      ceo_name: data.ceo_name,
      board_members: data.board_members as Prisma.InputJsonValue | undefined,
      activity_scope: data.activity_scope,
      geo_area: data.geo_area,
      iban: data.iban,
      status: "PENDING_KYC",
    },
  });
  return mapCooperative(c);
}

export async function upsertCooperative(
  data: Omit<CooperativeRow, "created_at"> & { id?: number; created_at?: Date },
): Promise<CooperativeRow> {
  const status = data.status ?? "PENDING_KYC";
  const baseData = {
    mine_id: toBig(data.mine_id),
    name: data.name,
    national_id: data.national_id,
    registration_number: data.registration_number,
    charter_file_url: data.charter_file_url,
    ceo_name: data.ceo_name,
    board_members: data.board_members as Prisma.InputJsonValue | undefined,
    activity_scope: data.activity_scope,
    geo_area: data.geo_area,
    iban: data.iban,
    settings_json: data.settings_json as Prisma.InputJsonValue | undefined,
    status,
  };
  if (data.id != null) {
    const c = await prisma.cooperatives.upsert({
      where: { id: toBig(data.id) },
      create: { id: toBig(data.id), ...baseData },
      update: baseData,
    });
    return mapCooperative(c);
  }
  const c = await prisma.cooperatives.create({ data: baseData });
  return mapCooperative(c);
}

export async function verifyCooperative(id: number): Promise<CooperativeRow | null> {
  const existing = await findCooperativeById(id);
  if (!existing) return null;
  if (existing.status !== "PENDING_KYC" && existing.status !== "PENDING") {
    return null;
  }
  const c = await prisma.cooperatives.update({
    where: { id: toBig(id) },
    data: { status: "ACTIVE" },
  });
  return mapCooperative(c);
}

export async function suspendCooperative(id: number): Promise<CooperativeRow | null> {
  const existing = await findCooperativeById(id);
  if (!existing) return null;
  const c = await prisma.cooperatives.update({
    where: { id: toBig(id) },
    data: { status: "SUSPENDED" },
  });
  return mapCooperative(c);
}
