import type { LoadStatus, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

type Tx = Prisma.TransactionClient;
import { toBig, toNum } from "./id";
import { fromDecimal, toDecimal } from "./decimal";

export type LoadRow = {
  id: number;
  load_tracking_code: string;
  mine_id: number;
  household_id: number;
  material_type: string;
  quantity_tons?: number;
  status: LoadStatus;
  created_at: Date;
  updated_at: Date;
};

function mapLoad(r: {
  id: bigint;
  load_tracking_code: string;
  mine_id: bigint;
  household_id: bigint;
  material_type: string;
  quantity_tons: { toString(): string } | null;
  status: LoadStatus;
  created_at: Date;
  updated_at: Date;
}): LoadRow {
  return {
    id: toNum(r.id),
    load_tracking_code: r.load_tracking_code,
    mine_id: toNum(r.mine_id),
    household_id: toNum(r.household_id),
    material_type: r.material_type,
    quantity_tons: r.quantity_tons != null ? fromDecimal(r.quantity_tons) : undefined,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function getLoadById(loadId: number): Promise<LoadRow | null> {
  const r = await prisma.loads.findUnique({ where: { id: toBig(loadId) } });
  return r ? mapLoad(r) : null;
}

export async function createLoad(
  params: {
    load_tracking_code: string;
    mine_id: number;
    household_id: number;
    material_type: string;
    quantity_tons?: number;
    status?: LoadStatus;
  },
  tx?: Tx,
): Promise<LoadRow> {
  const db = tx ?? prisma;
  const r = await db.loads.create({
    data: {
      load_tracking_code: params.load_tracking_code,
      mine_id: toBig(params.mine_id),
      household_id: toBig(params.household_id),
      material_type: params.material_type,
      quantity_tons: params.quantity_tons != null ? toDecimal(params.quantity_tons) : undefined,
      status: params.status ?? "IN_TRANSIT",
    },
  });
  return mapLoad(r);
}
