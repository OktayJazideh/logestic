import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { ACTIVE_MISSION_STATUSES } from "../lib/missionFsm";
import { toBig, toNum } from "./id";

export type DispatchCandidate = {
  vehicle_id: number;
  owner_id: number;
  driver_id: number;
  cooperative_id: number;
  capacity_tons: number;
  last_assigned_at: Date | null;
};

export async function listDispatchCandidatesForMine(mineId: number): Promise<DispatchCandidate[]> {
  const coops = await prisma.cooperatives.findMany({
    where: { mine_id: toBig(mineId) },
    select: { id: true },
  });
  const coopIds = coops.map((c) => c.id);
  if (coopIds.length === 0) return [];

  const [vehicles, drivers, owners, missionTimes] = await Promise.all([
    prisma.vehicles.findMany({
      where: { cooperative_id: { in: coopIds }, status: "APPROVED" },
      orderBy: { id: "asc" },
    }),
    prisma.drivers.findMany({
      where: { cooperative_id: { in: coopIds }, status: "APPROVED" },
      orderBy: { id: "asc" },
    }),
    prisma.fleet_owners.findMany({
      where: { cooperative_id: { in: coopIds }, status: "APPROVED" },
      select: { id: true },
    }),
    prisma.missions.findMany({
      where: { load: { mine_id: toBig(mineId) } },
      select: { driver_id: true, owner_id: true, created_at: true },
      orderBy: { created_at: "desc" },
    }),
  ]);

  const approvedOwnerIds = new Set(owners.map((o) => toNum(o.id)));
  const driverLast = new Map<number, Date>();
  const ownerLast = new Map<number, Date>();
  for (const m of missionTimes) {
    const did = toNum(m.driver_id);
    const oid = toNum(m.owner_id);
    if (!driverLast.has(did)) driverLast.set(did, m.created_at);
    if (!ownerLast.has(oid)) ownerLast.set(oid, m.created_at);
  }

  const driversByCoop = new Map<number, number[]>();
  for (const d of drivers) {
    if (d.cooperative_id == null) continue;
    const cid = toNum(d.cooperative_id);
    const list = driversByCoop.get(cid) ?? [];
    list.push(toNum(d.id));
    driversByCoop.set(cid, list);
  }

  const coopDriverCursor = new Map<number, number>();

  function pickDriverForCoop(coopId: number): number | null {
    const pool = driversByCoop.get(coopId);
    if (!pool?.length) return null;
    const sorted = [...pool].sort((a, b) => {
      const ta = driverLast.get(a)?.getTime() ?? 0;
      const tb = driverLast.get(b)?.getTime() ?? 0;
      return ta - tb;
    });
    const cursor = coopDriverCursor.get(coopId) ?? 0;
    const driverId = sorted[cursor % sorted.length]!;
    coopDriverCursor.set(coopId, cursor + 1);
    return driverId;
  }

  const candidates: DispatchCandidate[] = [];
  for (const v of vehicles) {
    const ownerId = toNum(v.owner_id);
    if (!approvedOwnerIds.has(ownerId)) continue;
    if (v.cooperative_id == null) continue;
    const coopId = toNum(v.cooperative_id);
    const driverId = pickDriverForCoop(coopId);
    if (driverId == null) continue;

    const ownerAt = ownerLast.get(ownerId);
    const driverAt = driverLast.get(driverId);
    const last =
      ownerAt && driverAt
        ? ownerAt > driverAt
          ? ownerAt
          : driverAt
        : ownerAt ?? driverAt ?? null;

    candidates.push({
      vehicle_id: toNum(v.id),
      owner_id: ownerId,
      driver_id: driverId,
      cooperative_id: coopId,
      capacity_tons: Number(v.capacity_tons),
      last_assigned_at: last,
    });
  }

  return candidates;
}

export async function findApprovedHouseholdForVillage(villageId: number): Promise<number | null> {
  const h = await prisma.households.findFirst({
    where: { village_id: toBig(villageId), status: "APPROVED" },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return h ? toNum(h.id) : null;
}

export type MissionAssignmentPlan = { candidate: DispatchCandidate; quantity_tons: number };

/** Round-robin + capacity-weighted greedy split (no manual driver/fleet pick). */
export function planMissionAssignments(
  needId: number,
  totalTons: number,
  candidates: DispatchCandidate[],
): MissionAssignmentPlan[] {
  if (candidates.length === 0) {
    throw new Error("no_dispatch_candidates");
  }

  const sorted = [...candidates].sort((a, b) => {
    const ta = a.last_assigned_at?.getTime() ?? 0;
    const tb = b.last_assigned_at?.getTime() ?? 0;
    if (ta !== tb) return ta - tb;
    return b.capacity_tons - a.capacity_tons;
  });

  const start = needId % sorted.length;
  const rotated = [...sorted.slice(start), ...sorted.slice(0, start)];

  const plans: MissionAssignmentPlan[] = [];
  let remaining = totalTons;
  let idx = 0;
  let guard = 0;
  const maxIter = Math.max(rotated.length * 50, 100);

  while (remaining > 0.0001 && guard < maxIter) {
    const candidate = rotated[idx % rotated.length]!;
    const take = Math.min(remaining, candidate.capacity_tons);
    if (take <= 0) {
      idx += 1;
      guard += 1;
      continue;
    }
    plans.push({ candidate, quantity_tons: Math.round(take * 100) / 100 });
    remaining = Math.round((remaining - take) * 100) / 100;
    idx += 1;
    guard += 1;
  }

  if (remaining > 0.0001) {
    throw new Error("insufficient_vehicle_capacity");
  }

  return plans;
}

/** Mission ids created for a dispatched need (load_tracking_code prefix LOAD-NEED{id}-). */
export async function listMissionIdsForNeed(needId: number): Promise<number[]> {
  const prefix = `LOAD-NEED${needId}-`;
  const loads = await prisma.loads.findMany({
    where: { load_tracking_code: { startsWith: prefix } },
    select: { id: true },
  });
  if (loads.length === 0) return [];
  const missions = await prisma.missions.findMany({
    where: { load_id: { in: loads.map((l) => l.id) } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return missions.map((m) => toNum(m.id));
}

export type Tx = Prisma.TransactionClient;

export async function hasActiveMissionForDriver(driverId: number, tx?: Tx): Promise<boolean> {
  const db = tx ?? prisma;
  const row = await db.missions.findFirst({
    where: { driver_id: toBig(driverId), status: { in: ACTIVE_MISSION_STATUSES } },
    select: { id: true },
  });
  return row != null;
}

export async function hasActiveMissionForVehicle(vehicleId: number, tx?: Tx): Promise<boolean> {
  const db = tx ?? prisma;
  const row = await db.missions.findFirst({
    where: { vehicle_id: toBig(vehicleId), status: { in: ACTIVE_MISSION_STATUSES } },
    select: { id: true },
  });
  return row != null;
}
