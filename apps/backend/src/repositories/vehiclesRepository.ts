import type { ApprovalStatus } from "@prisma/client";

import { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma";

import { toBig, toNum } from "./id";



export type VehicleRow = {

  id: number;

  owner_id: number;

  cooperative_id?: number;

  license_plate: string;

  vehicle_type: string;

  capacity_tons: number;

  status: ApprovalStatus;

  ownership_doc_url?: string;

  insurance_doc_url?: string;

};



function mapRow(v: {

  id: bigint;

  owner_id: bigint;

  cooperative_id: bigint | null;

  license_plate: string;

  vehicle_type: string;

  capacity_tons: Prisma.Decimal;

  status: ApprovalStatus;

  ownership_doc_url: string | null;

  insurance_doc_url: string | null;

}): VehicleRow {

  return {

    id: toNum(v.id),

    owner_id: toNum(v.owner_id),

    cooperative_id: v.cooperative_id != null ? toNum(v.cooperative_id) : undefined,

    license_plate: v.license_plate,

    vehicle_type: v.vehicle_type,

    capacity_tons: Number(v.capacity_tons),

    status: v.status,

    ownership_doc_url: v.ownership_doc_url ?? undefined,

    insurance_doc_url: v.insurance_doc_url ?? undefined,

  };

}



export async function listVehicles(): Promise<VehicleRow[]> {

  const rows = await prisma.vehicles.findMany({ orderBy: { id: "asc" } });

  return rows.map(mapRow);

}



export async function listVehiclesByCooperative(cooperativeId: number): Promise<VehicleRow[]> {

  const rows = await prisma.vehicles.findMany({

    where: { cooperative_id: toBig(cooperativeId) },

    orderBy: { id: "asc" },

  });

  return rows.map(mapRow);

}



export async function listPendingVehiclesByCooperative(cooperativeId: number): Promise<VehicleRow[]> {
  return listVehiclesByCooperativeAndStatus(cooperativeId, "PENDING");
}

export async function listVehiclesByCooperativeAndStatus(
  cooperativeId: number,
  status: ApprovalStatus,
): Promise<VehicleRow[]> {
  const rows = await prisma.vehicles.findMany({
    where: { cooperative_id: toBig(cooperativeId), status },
    orderBy: { id: "asc" },
  });
  return rows.map(mapRow);
}

export async function patchVehicleKycFields(
  id: number,
  fields: {
    ownership_doc_url?: string;
    insurance_doc_url?: string;
    license_plate?: string;
    vehicle_type?: string;
    capacity_tons?: number;
  },
): Promise<VehicleRow | null> {
  const data: {
    ownership_doc_url?: string;
    insurance_doc_url?: string;
    license_plate?: string;
    vehicle_type?: string;
    capacity_tons?: Prisma.Decimal;
  } = {};
  if (fields.ownership_doc_url != null) data.ownership_doc_url = fields.ownership_doc_url;
  if (fields.insurance_doc_url != null) data.insurance_doc_url = fields.insurance_doc_url;
  if (fields.license_plate != null) data.license_plate = fields.license_plate;
  if (fields.vehicle_type != null) data.vehicle_type = fields.vehicle_type;
  if (fields.capacity_tons != null) data.capacity_tons = new Prisma.Decimal(fields.capacity_tons);
  if (Object.keys(data).length === 0) return findVehicleById(id);
  try {
    const v = await prisma.vehicles.update({
      where: { id: toBig(id) },
      data: { ...data, status: "PENDING" },
    });
    return mapRow(v);
  } catch {
    return null;
  }
}



export async function findVehicleById(vehicleId: number): Promise<VehicleRow | null> {

  const v = await prisma.vehicles.findUnique({ where: { id: toBig(vehicleId) } });

  return v ? mapRow(v) : null;

}



export async function listVehiclesByOwner(ownerId: number): Promise<VehicleRow[]> {

  const rows = await prisma.vehicles.findMany({

    where: { owner_id: toBig(ownerId) },

    orderBy: { id: "asc" },

  });

  return rows.map(mapRow);

}



export async function upsertVehicle(params: Omit<VehicleRow, "id">): Promise<VehicleRow> {

  const existing = await prisma.vehicles.findUnique({ where: { license_plate: params.license_plate } });

  const coopId = params.cooperative_id != null ? toBig(params.cooperative_id) : null;

  if (existing) {

    const v = await prisma.vehicles.update({

      where: { id: existing.id },

      data: {

        owner_id: toBig(params.owner_id),

        cooperative_id: coopId,

        vehicle_type: params.vehicle_type,

        capacity_tons: new Prisma.Decimal(params.capacity_tons),

        status: params.status,

        ownership_doc_url: params.ownership_doc_url,

        insurance_doc_url: params.insurance_doc_url,

      },

    });

    return mapRow(v);

  }

  const v = await prisma.vehicles.create({

    data: {

      owner_id: toBig(params.owner_id),

      cooperative_id: coopId,

      license_plate: params.license_plate,

      vehicle_type: params.vehicle_type,

      capacity_tons: new Prisma.Decimal(params.capacity_tons),

      status: params.status,

      ownership_doc_url: params.ownership_doc_url,

      insurance_doc_url: params.insurance_doc_url,

    },

  });

  return mapRow(v);

}



export async function updateVehicleStatus(id: number, status: ApprovalStatus): Promise<VehicleRow | null> {

  try {

    const v = await prisma.vehicles.update({

      where: { id: toBig(id) },

      data: { status },

    });

    return mapRow(v);

  } catch {

    return null;

  }

}


