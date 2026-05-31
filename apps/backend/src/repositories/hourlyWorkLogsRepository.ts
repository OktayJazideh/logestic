import type { HourlyWorkLogStatus, Prisma } from "@prisma/client";
import { Prisma as PrismaNs } from "@prisma/client";
import { prisma } from "../db/prisma";
import { fromDecimal } from "./decimal";
import { toBig, toNum } from "./id";

function toHourDecimal(amount: number): PrismaNs.Decimal {
  return new PrismaNs.Decimal(amount.toFixed(6));
}

export type GeoPoint = { lat: number; lng: number };

export type HourlyWorkLogRow = {
  id: number;
  mission_id?: number;
  mine_id: number;
  fleet_owner_id: number;
  vehicle_id?: number;
  household_id?: number;
  started_at?: Date;
  ended_at?: Date;
  raw_hours?: number;
  billable_hours?: number;
  start_photo_url?: string;
  end_photo_url?: string;
  start_geo?: GeoPoint;
  end_geo?: GeoPoint;
  note?: string;
  hourly_rate_snapshot?: number;
  status: HourlyWorkLogStatus;
  consultant_user_id?: number;
  consultant_verified_at?: Date;
  verification_reason?: string;
  rejection_reason?: string;
  rejected_at?: Date;
  rejected_by_user_id?: number;
  created_at: Date;
  updated_at: Date;
};

type Tx = Prisma.TransactionClient;

function parseGeo(v: unknown): GeoPoint | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.lat === "number" && typeof o.lng === "number") return { lat: o.lat, lng: o.lng };
  return undefined;
}

function mapRow(r: {
  id: bigint;
  mission_id: bigint | null;
  mine_id: bigint;
  fleet_owner_id: bigint;
  vehicle_id: bigint | null;
  household_id: bigint | null;
  started_at: Date | null;
  ended_at: Date | null;
  raw_hours: Prisma.Decimal | null;
  billable_hours: Prisma.Decimal | null;
  start_photo_url: string | null;
  end_photo_url: string | null;
  start_geo: unknown;
  end_geo: unknown;
  note: string | null;
  hourly_rate_snapshot: Prisma.Decimal | null;
  status: HourlyWorkLogStatus;
  consultant_user_id: bigint | null;
  consultant_verified_at: Date | null;
  verification_reason: string | null;
  rejection_reason: string | null;
  rejected_at: Date | null;
  rejected_by_user_id: bigint | null;
  created_at: Date;
  updated_at: Date;
}): HourlyWorkLogRow {
  return {
    id: toNum(r.id),
    mission_id: r.mission_id != null ? toNum(r.mission_id) : undefined,
    mine_id: toNum(r.mine_id),
    fleet_owner_id: toNum(r.fleet_owner_id),
    vehicle_id: r.vehicle_id != null ? toNum(r.vehicle_id) : undefined,
    household_id: r.household_id != null ? toNum(r.household_id) : undefined,
    started_at: r.started_at ?? undefined,
    ended_at: r.ended_at ?? undefined,
    raw_hours: r.raw_hours != null ? fromDecimal(r.raw_hours) : undefined,
    billable_hours: r.billable_hours != null ? fromDecimal(r.billable_hours) : undefined,
    start_photo_url: r.start_photo_url ?? undefined,
    end_photo_url: r.end_photo_url ?? undefined,
    start_geo: parseGeo(r.start_geo),
    end_geo: parseGeo(r.end_geo),
    note: r.note ?? undefined,
    hourly_rate_snapshot: r.hourly_rate_snapshot != null ? fromDecimal(r.hourly_rate_snapshot) : undefined,
    status: r.status,
    consultant_user_id: r.consultant_user_id != null ? toNum(r.consultant_user_id) : undefined,
    consultant_verified_at: r.consultant_verified_at ?? undefined,
    verification_reason: r.verification_reason ?? undefined,
    rejection_reason: r.rejection_reason ?? undefined,
    rejected_at: r.rejected_at ?? undefined,
    rejected_by_user_id: r.rejected_by_user_id != null ? toNum(r.rejected_by_user_id) : undefined,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function findHourlyLogById(id: number, tx?: Tx): Promise<HourlyWorkLogRow | null> {
  const db = tx ?? prisma;
  const row = await db.hourly_work_logs.findUnique({ where: { id: toBig(id) } });
  return row ? mapRow(row) : null;
}

export async function findActiveLogForMission(missionId: number, tx?: Tx): Promise<HourlyWorkLogRow | null> {
  const db = tx ?? prisma;
  const row = await db.hourly_work_logs.findFirst({
    where: { mission_id: toBig(missionId), status: "STARTED" },
    orderBy: { id: "desc" },
  });
  return row ? mapRow(row) : null;
}

export async function createStartedLog(
  params: {
    mission_id: number;
    mine_id: number;
    fleet_owner_id: number;
    vehicle_id: number;
    household_id: number;
    start_photo_url: string;
    start_geo: GeoPoint;
    note?: string;
  },
  tx?: Tx,
): Promise<HourlyWorkLogRow> {
  const db = tx ?? prisma;
  const now = new Date();
  const row = await db.hourly_work_logs.create({
    data: {
      mission_id: toBig(params.mission_id),
      mine_id: toBig(params.mine_id),
      fleet_owner_id: toBig(params.fleet_owner_id),
      vehicle_id: toBig(params.vehicle_id),
      household_id: toBig(params.household_id),
      started_at: now,
      start_photo_url: params.start_photo_url,
      start_geo: params.start_geo,
      note: params.note,
      status: "STARTED",
    },
  });
  return mapRow(row);
}

export async function endLog(
  id: number,
  params: { end_photo_url: string; end_geo: GeoPoint; note?: string },
  tx?: Tx,
): Promise<HourlyWorkLogRow | null> {
  const db = tx ?? prisma;
  const existing = await db.hourly_work_logs.findUnique({ where: { id: toBig(id) } });
  if (!existing || existing.status !== "STARTED" || !existing.started_at) return null;

  const endedAt = new Date();
  const ms = endedAt.getTime() - existing.started_at.getTime();
  const rawHours = Number((ms / (1000 * 60 * 60)).toFixed(6));

  const row = await db.hourly_work_logs.update({
    where: { id: toBig(id) },
    data: {
      ended_at: endedAt,
      raw_hours: toHourDecimal(rawHours),
      end_photo_url: params.end_photo_url,
      end_geo: params.end_geo,
      note: params.note ?? existing.note,
      status: "ENDED",
    },
  });
  return mapRow(row);
}

export async function verifyLog(
  id: number,
  params: {
    billable_hours: number;
    hourly_rate_snapshot: number;
    consultant_user_id: number;
    verification_reason: string;
  },
  tx?: Tx,
): Promise<HourlyWorkLogRow | null> {
  const db = tx ?? prisma;
  const row = await db.hourly_work_logs.update({
    where: { id: toBig(id) },
    data: {
      billable_hours: toHourDecimal(params.billable_hours),
      hourly_rate_snapshot: new PrismaNs.Decimal(params.hourly_rate_snapshot.toFixed(4)),
      consultant_user_id: toBig(params.consultant_user_id),
      consultant_verified_at: new Date(),
      verification_reason: params.verification_reason,
      status: "APPROVED",
    },
  });
  return mapRow(row);
}

export async function rejectLog(
  id: number,
  params: {
    rejection_reason: string;
    rejected_by_user_id: number;
  },
  tx?: Tx,
): Promise<HourlyWorkLogRow | null> {
  const db = tx ?? prisma;
  const row = await db.hourly_work_logs.update({
    where: { id: toBig(id) },
    data: {
      status: "REJECTED",
      rejection_reason: params.rejection_reason,
      rejected_at: new Date(),
      rejected_by_user_id: toBig(params.rejected_by_user_id),
    },
  });
  return mapRow(row);
}

export async function listForMine(mineId?: number, status?: HourlyWorkLogStatus): Promise<HourlyWorkLogRow[]> {
  const rows = await prisma.hourly_work_logs.findMany({
    where: {
      ...(mineId != null ? { mine_id: toBig(mineId) } : {}),
      ...(status != null ? { status } : {}),
    },
    orderBy: { created_at: "desc" },
  });
  return rows.map(mapRow);
}
