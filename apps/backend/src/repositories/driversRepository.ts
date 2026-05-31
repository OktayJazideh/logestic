import type { ApprovalStatus } from "@prisma/client";

import { prisma } from "../db/prisma";

import { toBig, toNum } from "./id";



export type DriverRow = {

  id: number;

  user_id: number;

  cooperative_id?: number;

  full_name: string;

  license_number?: string;

  license_file_url?: string;

  identity_file_url?: string;

  status: ApprovalStatus;

};



function mapRow(d: {

  id: bigint;

  user_id: bigint;

  cooperative_id: bigint | null;

  full_name: string;

  license_number: string | null;

  license_file_url: string | null;

  identity_file_url: string | null;

  status: ApprovalStatus;

}): DriverRow {

  return {

    id: toNum(d.id),

    user_id: toNum(d.user_id),

    cooperative_id: d.cooperative_id != null ? toNum(d.cooperative_id) : undefined,

    full_name: d.full_name,

    license_number: d.license_number ?? undefined,

    license_file_url: d.license_file_url ?? undefined,

    identity_file_url: d.identity_file_url ?? undefined,

    status: d.status,

  };

}



export async function listDrivers(): Promise<DriverRow[]> {

  const rows = await prisma.drivers.findMany({ orderBy: { id: "asc" } });

  return rows.map(mapRow);

}



export async function listDriversByCooperative(cooperativeId: number): Promise<DriverRow[]> {

  const rows = await prisma.drivers.findMany({

    where: { cooperative_id: toBig(cooperativeId) },

    orderBy: { id: "asc" },

  });

  return rows.map(mapRow);

}



export async function listPendingDriversByCooperative(cooperativeId: number): Promise<DriverRow[]> {
  return listDriversByCooperativeAndStatus(cooperativeId, "PENDING");
}

export async function listDriversByCooperativeAndStatus(
  cooperativeId: number,
  status: ApprovalStatus,
): Promise<DriverRow[]> {
  const rows = await prisma.drivers.findMany({
    where: { cooperative_id: toBig(cooperativeId), status },
    orderBy: { id: "asc" },
  });
  return rows.map(mapRow);
}

export async function patchDriverKycFields(
  id: number,
  fields: {
    full_name?: string;
    license_number?: string;
    license_file_url?: string;
    identity_file_url?: string;
  },
): Promise<DriverRow | null> {
  const data: Record<string, string> = {};
  if (fields.full_name != null) data.full_name = fields.full_name;
  if (fields.license_number != null) data.license_number = fields.license_number;
  if (fields.license_file_url != null) data.license_file_url = fields.license_file_url;
  if (fields.identity_file_url != null) data.identity_file_url = fields.identity_file_url;
  if (Object.keys(data).length === 0) return findDriverById(id);
  try {
    const d = await prisma.drivers.update({
      where: { id: toBig(id) },
      data: { ...data, status: "PENDING" },
    });
    return mapRow(d);
  } catch {
    return null;
  }
}



export async function findDriverById(driverId: number): Promise<DriverRow | null> {

  const d = await prisma.drivers.findUnique({ where: { id: toBig(driverId) } });

  return d ? mapRow(d) : null;

}



export async function findDriverByUserId(userId: number): Promise<DriverRow | null> {

  const d = await prisma.drivers.findUnique({ where: { user_id: toBig(userId) } });

  return d ? mapRow(d) : null;

}



export async function upsertDriver(params: Omit<DriverRow, "id">): Promise<DriverRow> {

  const existing = await prisma.drivers.findUnique({ where: { user_id: toBig(params.user_id) } });

  const coopId = params.cooperative_id != null ? toBig(params.cooperative_id) : null;

  if (existing) {

    const d = await prisma.drivers.update({

      where: { id: existing.id },

      data: {

        cooperative_id: coopId,

        full_name: params.full_name,

        license_number: params.license_number,

        license_file_url: params.license_file_url,

        identity_file_url: params.identity_file_url,

        status: params.status,

      },

    });

    return mapRow(d);

  }

  const d = await prisma.drivers.create({

    data: {

      user_id: toBig(params.user_id),

      cooperative_id: coopId,

      full_name: params.full_name,

      license_number: params.license_number,

      license_file_url: params.license_file_url,

      identity_file_url: params.identity_file_url,

      status: params.status,

    },

  });

  return mapRow(d);

}



export async function updateDriverStatus(id: number, status: ApprovalStatus): Promise<DriverRow | null> {

  try {

    const d = await prisma.drivers.update({

      where: { id: toBig(id) },

      data: { status },

    });

    return mapRow(d);

  } catch {

    return null;

  }

}


