import { prisma } from "../db/prisma";
import { toBig, toNum } from "./id";

export type MineRow = {
  id: number;
  mine_code: string;
  name: string;
  location_coordinates?: string;
};

export type VillageRow = {
  id: number;
  mine_id: number;
  name: string;
  district?: string;
};

export async function listMines(): Promise<MineRow[]> {
  const rows = await prisma.mines.findMany({ orderBy: { id: "asc" } });
  return rows.map((m) => ({
    id: toNum(m.id),
    mine_code: m.mine_code,
    name: m.name,
    location_coordinates: m.location_coordinates ?? undefined,
  }));
}

export async function getMine(mineId: number): Promise<MineRow | null> {
  const m = await prisma.mines.findUnique({ where: { id: toBig(mineId) } });
  if (!m) return null;
  return {
    id: toNum(m.id),
    mine_code: m.mine_code,
    name: m.name,
    location_coordinates: m.location_coordinates ?? undefined,
  };
}

export async function upsertMine(data: Omit<MineRow, "id"> & { id?: number }): Promise<MineRow> {
  if (data.id != null) {
    const m = await prisma.mines.upsert({
      where: { id: toBig(data.id) },
      create: {
        id: toBig(data.id),
        mine_code: data.mine_code,
        name: data.name,
        location_coordinates: data.location_coordinates,
      },
      update: {
        mine_code: data.mine_code,
        name: data.name,
        location_coordinates: data.location_coordinates,
      },
    });
    return { id: toNum(m.id), mine_code: m.mine_code, name: m.name, location_coordinates: m.location_coordinates ?? undefined };
  }
  const m = await prisma.mines.upsert({
    where: { mine_code: data.mine_code },
    create: {
      mine_code: data.mine_code,
      name: data.name,
      location_coordinates: data.location_coordinates,
    },
    update: {
      name: data.name,
      location_coordinates: data.location_coordinates,
    },
  });
  return { id: toNum(m.id), mine_code: m.mine_code, name: m.name, location_coordinates: m.location_coordinates ?? undefined };
}

export async function listVillagesByMine(mineId: number): Promise<VillageRow[]> {
  const rows = await prisma.villages.findMany({
    where: { mine_id: toBig(mineId) },
    orderBy: { id: "asc" },
  });
  return rows.map((v) => ({
    id: toNum(v.id),
    mine_id: toNum(v.mine_id),
    name: v.name,
    district: v.district ?? undefined,
  }));
}

export async function upsertVillage(data: Omit<VillageRow, "id"> & { id?: number }): Promise<VillageRow> {
  if (data.id != null) {
    const v = await prisma.villages.upsert({
      where: { id: toBig(data.id) },
      create: {
        id: toBig(data.id),
        mine_id: toBig(data.mine_id),
        name: data.name,
        district: data.district,
      },
      update: { name: data.name, district: data.district, mine_id: toBig(data.mine_id) },
    });
    return { id: toNum(v.id), mine_id: toNum(v.mine_id), name: v.name, district: v.district ?? undefined };
  }
  const v = await prisma.villages.create({
    data: {
      mine_id: toBig(data.mine_id),
      name: data.name,
      district: data.district,
    },
  });
  return { id: toNum(v.id), mine_id: toNum(v.mine_id), name: v.name, district: v.district ?? undefined };
}
