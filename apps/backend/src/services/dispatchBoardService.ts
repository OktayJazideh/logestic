import type { MissionStatus } from "@prisma/client";
import { prisma } from "../db/prisma";
import { fromDecimal } from "../repositories/decimal";
import { toBig, toNum } from "../repositories/id";

const DISPATCHED_MISSION_STATUSES: MissionStatus[] = ["CREATED", "ASSIGNED"];
const IN_PROGRESS_STATUSES: MissionStatus[] = ["ACCEPTED", "ARRIVED", "LOADED", "IN_TRANSIT"];
const AWAITING_WB_STATUSES: MissionStatus[] = ["DELIVERED"];
const VERIFIED_STATUSES: MissionStatus[] = ["VERIFIED"];

function needIdFromTrackingCode(code: string): number | null {
  const m = /^LOAD-NEED(\d+)-/.exec(code);
  return m ? Number(m[1]) : null;
}

function operationTypeLabel(row: {
  operation_type: string;
  operation_type_catalog?: { code: string; name_fa: string } | null;
}): string {
  return row.operation_type_catalog?.name_fa ?? row.operation_type_catalog?.code ?? row.operation_type;
}

function tonsFromLoad(q: { toNumber(): number } | number | string | null | undefined): number {
  if (q == null) return 0;
  if (typeof q === "object" && q !== null && "toNumber" in q) return (q as { toNumber(): number }).toNumber();
  return Number(q);
}

export type DispatchBoardPayload = {
  columns: {
    PENDING_NEEDS: Array<{
      need_id: number;
      village_name: string;
      quantity_tons: number;
      operation_type: string;
      created_at: string;
    }>;
    DISPATCHED: Array<{
      need_id: number;
      missions: Array<{
        mission_id: number;
        driver_name: string;
        vehicle_plate: string;
        quantity_tons: number;
      }>;
    }>;
    IN_PROGRESS: Array<{
      mission_id: number;
      status: string;
      driver_name: string;
      vehicle_plate: string;
    }>;
    AWAITING_WB: Array<{
      mission_id: number;
      driver_name: string;
      ticket_status: string;
    }>;
    VERIFIED: Array<{
      mission_id: number;
      verified_net_tons: number;
      verified_at: string;
    }>;
  };
  generated_at: string;
};

export async function getDispatchBoard(mineId: number): Promise<DispatchBoardPayload> {
  const mineBig = toBig(mineId);
  const generated_at = new Date().toISOString();

  const [
    pendingRows,
    dispatchedNeedRows,
    earlyMissions,
    inProgressRows,
    awaitingRows,
    verifiedRows,
  ] = await Promise.all([
    prisma.operation_needs.findMany({
      where: { mine_id: mineBig, status: "PENDING", deleted_at: null },
      include: {
        village: { select: { name: true } },
        operation_type_catalog: { select: { code: true, name_fa: true } },
      },
      orderBy: { created_at: "asc" },
    }),
    prisma.operation_needs.findMany({
      where: { mine_id: mineBig, status: "DISPATCHED", deleted_at: null },
      select: { id: true },
      orderBy: { created_at: "asc" },
    }),
    prisma.missions.findMany({
      where: {
        status: { in: DISPATCHED_MISSION_STATUSES },
        load: { mine_id: mineBig },
      },
      include: {
        driver: { select: { full_name: true } },
        vehicle: { select: { license_plate: true } },
        load: { select: { quantity_tons: true, load_tracking_code: true } },
      },
      orderBy: { id: "asc" },
    }),
    prisma.missions.findMany({
      where: {
        status: { in: IN_PROGRESS_STATUSES },
        load: { mine_id: mineBig },
      },
      include: {
        driver: { select: { full_name: true } },
        vehicle: { select: { license_plate: true } },
      },
      orderBy: { updated_at: "desc" },
    }),
    prisma.missions.findMany({
      where: {
        status: { in: AWAITING_WB_STATUSES },
        load: { mine_id: mineBig },
      },
      include: {
        driver: { select: { full_name: true } },
        weighbridge_tickets: { select: { status: true } },
      },
      orderBy: { updated_at: "desc" },
    }),
    prisma.missions.findMany({
      where: {
        status: { in: VERIFIED_STATUSES },
        load: { mine_id: mineBig },
      },
      select: {
        id: true,
        verified_at: true,
        verified_net_tons_kg: true,
      },
      orderBy: { verified_at: "desc" },
      take: 50,
    }),
  ]);

  const dispatchedNeedIds = new Set(dispatchedNeedRows.map((n) => toNum(n.id)));
  const missionsByNeed = new Map<
    number,
    Array<{ mission_id: number; driver_name: string; vehicle_plate: string; quantity_tons: number }>
  >();

  for (const m of earlyMissions) {
    const needId = needIdFromTrackingCode(m.load.load_tracking_code);
    if (needId == null || !dispatchedNeedIds.has(needId)) continue;
    const list = missionsByNeed.get(needId) ?? [];
    list.push({
      mission_id: toNum(m.id),
      driver_name: m.driver.full_name,
      vehicle_plate: m.vehicle.license_plate,
      quantity_tons: tonsFromLoad(m.load.quantity_tons),
    });
    missionsByNeed.set(needId, list);
  }

  const DISPATCHED = [...dispatchedNeedIds]
    .sort((a, b) => a - b)
    .map((need_id) => ({
      need_id,
      missions: missionsByNeed.get(need_id) ?? [],
    }))
    .filter((row) => row.missions.length > 0);

  return {
    columns: {
      PENDING_NEEDS: pendingRows.map((n) => ({
        need_id: toNum(n.id),
        village_name: n.village.name,
        quantity_tons: tonsFromLoad(n.quantity_tons),
        operation_type: operationTypeLabel(n),
        created_at: n.created_at.toISOString(),
      })),
      DISPATCHED,
      IN_PROGRESS: inProgressRows.map((m) => ({
        mission_id: toNum(m.id),
        status: m.status,
        driver_name: m.driver.full_name,
        vehicle_plate: m.vehicle.license_plate,
      })),
      AWAITING_WB: awaitingRows.map((m) => ({
        mission_id: toNum(m.id),
        driver_name: m.driver.full_name,
        ticket_status: m.weighbridge_tickets?.status ?? "NONE",
      })),
      VERIFIED: verifiedRows
        .filter((m) => m.verified_at != null)
        .map((m) => ({
          mission_id: toNum(m.id),
          verified_net_tons:
            m.verified_net_tons_kg != null ? Math.round((fromDecimal(m.verified_net_tons_kg) / 1000) * 100) / 100 : 0,
          verified_at: m.verified_at!.toISOString(),
        })),
    },
    generated_at,
  };
}
