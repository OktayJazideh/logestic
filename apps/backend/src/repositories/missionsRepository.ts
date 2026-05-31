import type { MissionPaymentState, MissionStatus, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { resolveFactoryGeofence, resolveMineGeofence } from "../services/geofenceService";
import { toBig, toNum } from "./id";
import { fromDecimal, toDecimal } from "./decimal";

export type MissionRow = {
  id: number;
  load_id: number;
  mine_id: number;
  owner_id: number;
  driver_id: number;
  vehicle_id: number;
  status: MissionStatus;
  payment_state: MissionPaymentState;
  rate_per_ton_snapshot?: number;
  material_type_snapshot?: string;
  completed_at?: Date;
  verified_at?: Date;
  created_at: Date;
  updated_at: Date;
};

type Tx = Prisma.TransactionClient;

function mapMission(
  r: {
    id: bigint;
    load_id: bigint;
    owner_id: bigint;
    driver_id: bigint;
    vehicle_id: bigint;
    status: MissionStatus;
    payment_state: MissionPaymentState;
    rate_per_ton_snapshot: { toString(): string } | null;
    material_type_snapshot: string | null;
    completed_at: Date | null;
    verified_at: Date | null;
    created_at: Date;
    updated_at: Date;
  },
  mine_id: number,
): MissionRow {
  return {
    id: toNum(r.id),
    load_id: toNum(r.load_id),
    mine_id,
    owner_id: toNum(r.owner_id),
    driver_id: toNum(r.driver_id),
    vehicle_id: toNum(r.vehicle_id),
    status: r.status,
    payment_state: r.payment_state,
    rate_per_ton_snapshot: r.rate_per_ton_snapshot != null ? fromDecimal(r.rate_per_ton_snapshot) : undefined,
    material_type_snapshot: r.material_type_snapshot ?? undefined,
    completed_at: r.completed_at ?? undefined,
    verified_at: r.verified_at ?? undefined,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function mapWithLoad(
  r: {
    id: bigint;
    load_id: bigint;
    owner_id: bigint;
    driver_id: bigint;
    vehicle_id: bigint;
    status: MissionStatus;
    payment_state: MissionPaymentState;
    rate_per_ton_snapshot: { toString(): string } | null;
    material_type_snapshot: string | null;
    completed_at: Date | null;
    verified_at: Date | null;
    created_at: Date;
    updated_at: Date;
    load: { mine_id: bigint };
  },
): MissionRow {
  return mapMission(r, toNum(r.load.mine_id));
}

export async function getMissionById(missionId: number, tx?: Tx): Promise<MissionRow | null> {
  const db = tx ?? prisma;
  const r = await db.missions.findUnique({
    where: { id: toBig(missionId) },
    include: { load: true },
  });
  return r ? mapWithLoad(r) : null;
}

export async function listDriverMissions(driverId: number, mineId?: number): Promise<MissionRow[]> {
  const allowed: MissionStatus[] = [
    "ASSIGNED",
    "ACCEPTED",
    "ARRIVED",
    "LOADED",
    "IN_TRANSIT",
    "DELIVERED",
  ];
  const rows = await prisma.missions.findMany({
    where: {
      driver_id: toBig(driverId),
      status: { in: allowed },
      ...(mineId != null ? { load: { mine_id: toBig(mineId) } } : {}),
    },
    include: { load: true },
    orderBy: { created_at: "desc" },
  });
  return rows.map((r) => mapMission(r, toNum(r.load.mine_id)));
}

export type DriverMissionApiPayload = {
  id: number;
  load_id: number;
  mine_id: number;
  owner_id: number;
  driver_id: number;
  vehicle_id: number;
  status: MissionStatus;
  license_plate?: string;
  destination?: string;
  origin?: string;
  approximate_weight_kg?: number;
  material_type?: string;
  employer_contact?: string;
  mine_lat?: number;
  mine_lng?: number;
  factory_lat?: number;
  factory_lng?: number;
};

type MissionCoords = Pick<DriverMissionApiPayload, "mine_lat" | "mine_lng" | "factory_lat" | "factory_lng">;

async function coordsForMine(mineId: number): Promise<MissionCoords> {
  const [mineGeo, factoryGeo] = await Promise.all([
    resolveMineGeofence(mineId),
    resolveFactoryGeofence(mineId),
  ]);
  return {
    mine_lat: mineGeo?.lat,
    mine_lng: mineGeo?.lng,
    factory_lat: factoryGeo?.lat,
    factory_lng: factoryGeo?.lng,
  };
}

type DriverMissionRow = {
  id: bigint;
  load_id: bigint;
  owner_id: bigint;
  driver_id: bigint;
  vehicle_id: bigint;
  status: MissionStatus;
  material_type_snapshot: string | null;
  load: {
    mine_id: bigint;
    material_type: string;
    quantity_tons: { toNumber(): number } | Prisma.Decimal | null;
    mine: { name: string };
    household: { village_id: bigint; village: { name: string } };
  };
  vehicle: { license_plate: string };
};

async function buildDriverMissionApiPayload(
  r: DriverMissionRow,
  coordsCache: Map<number, MissionCoords>,
): Promise<DriverMissionApiPayload> {
  const mineIdNum = toNum(r.load.mine_id);
  let coords = coordsCache.get(mineIdNum);
  if (!coords) {
    coords = await coordsForMine(mineIdNum);
    coordsCache.set(mineIdNum, coords);
  }

  const need = await prisma.operation_needs.findFirst({
    where: {
      mine_id: r.load.mine_id,
      village_id: r.load.household.village_id,
      status: "DISPATCHED",
    },
    orderBy: { created_at: "desc" },
    include: { employer: true },
  });

  const tons =
    r.load.quantity_tons != null
      ? typeof r.load.quantity_tons === "object" && "toNumber" in r.load.quantity_tons
        ? (r.load.quantity_tons as { toNumber(): number }).toNumber()
        : Number(r.load.quantity_tons)
      : undefined;

  return {
    id: toNum(r.id),
    load_id: toNum(r.load_id),
    mine_id: mineIdNum,
    owner_id: toNum(r.owner_id),
    driver_id: toNum(r.driver_id),
    vehicle_id: toNum(r.vehicle_id),
    status: r.status,
    license_plate: r.vehicle.license_plate,
    destination: r.load.household.village.name,
    origin: r.load.mine.name,
    approximate_weight_kg: tons,
    material_type: r.material_type_snapshot ?? r.load.material_type,
    employer_contact: need?.employer.mobile_number,
    ...coords,
  };
}

/** Driver missions list with display fields for mobile (WF-UNLOAD / mission detail). */
export async function listDriverMissionsForApi(
  driverId: number,
  mineId?: number,
): Promise<DriverMissionApiPayload[]> {
  const allowed: MissionStatus[] = [
    "ASSIGNED",
    "ACCEPTED",
    "ARRIVED",
    "LOADED",
    "IN_TRANSIT",
    "DELIVERED",
  ];
  const rows = await prisma.missions.findMany({
    where: {
      driver_id: toBig(driverId),
      status: { in: allowed },
      ...(mineId != null ? { load: { mine_id: toBig(mineId) } } : {}),
    },
    include: {
      load: {
        include: {
          mine: true,
          household: { include: { village: true } },
        },
      },
      vehicle: true,
    },
    orderBy: { created_at: "desc" },
  });

  const coordsCache = new Map<number, MissionCoords>();
  const payloads: DriverMissionApiPayload[] = [];
  for (const r of rows) {
    payloads.push(await buildDriverMissionApiPayload(r, coordsCache));
  }
  return payloads;
}

/** Single driver mission for mobile detail / in-transit map (WF-INTRANSIT-1). */
export async function getDriverMissionForApi(
  driverId: number,
  missionId: number,
  mineId?: number,
): Promise<DriverMissionApiPayload | null> {
  const r = await prisma.missions.findFirst({
    where: {
      id: toBig(missionId),
      driver_id: toBig(driverId),
      ...(mineId != null ? { load: { mine_id: toBig(mineId) } } : {}),
    },
    include: {
      load: {
        include: {
          mine: true,
          household: { include: { village: true } },
        },
      },
      vehicle: true,
    },
  });
  if (!r) return null;
  return buildDriverMissionApiPayload(r, new Map());
}

export async function createMission(
  params: {
    load_id: number;
    owner_id: number;
    driver_id: number;
    vehicle_id: number;
    material_type_snapshot?: string;
  },
  tx?: Tx,
): Promise<MissionRow> {
  const db = tx ?? prisma;
  const r = await db.missions.create({
    data: {
      load_id: toBig(params.load_id),
      owner_id: toBig(params.owner_id),
      driver_id: toBig(params.driver_id),
      vehicle_id: toBig(params.vehicle_id),
      material_type_snapshot: params.material_type_snapshot,
      status: "CREATED",
      payment_state: "PENDING",
    },
    include: { load: true },
  });
  return mapWithLoad(r);
}

export async function updateMission(
  missionId: number,
  data: {
    status?: MissionStatus;
    payment_state?: MissionPaymentState;
    rate_per_ton_snapshot?: number;
    completed_at?: Date | null;
    verified_at?: Date | null;
  },
  tx?: Tx,
): Promise<MissionRow | null> {
  const db = tx ?? prisma;
  try {
    const r = await db.missions.update({
      where: { id: toBig(missionId) },
      data: {
        status: data.status,
        payment_state: data.payment_state,
        rate_per_ton_snapshot: data.rate_per_ton_snapshot != null ? toDecimal(data.rate_per_ton_snapshot) : undefined,
        completed_at: data.completed_at,
        verified_at: data.verified_at,
      },
      include: { load: true },
    });
    return mapWithLoad(r);
  } catch {
    return null;
  }
}

export async function assignMissionFromDispatch(missionId: number, tx?: Tx): Promise<MissionRow | null> {
  const row = await getMissionById(missionId, tx);
  if (!row || row.status !== "CREATED") return null;
  return updateMission(missionId, { status: "ASSIGNED" }, tx);
}

export async function settleVerifiedMission(missionId: number, tx?: Tx): Promise<MissionRow | null> {
  const row = await getMissionById(missionId, tx);
  if (!row || row.status !== "VERIFIED") return null;
  return updateMission(missionId, { status: "SETTLED", payment_state: "SETTLED" }, tx);
}

export type DriverDashboardMission = {
  id: number;
  status: MissionStatus;
  origin: string;
  destination: string;
  material_type: string;
  completed_at?: string;
};

export type DriverDashboardDriver = {
  full_name: string;
  driver_code: string;
};

export type DriverDashboardData = {
  state: "IDLE" | "ACTIVE" | "AWAITING_WB";
  driver: DriverDashboardDriver;
  active_mission?: DriverDashboardMission;
  summary: {
    today_trips: number;
    today_deliveries: number;
    today_km: number;
    pending_settlement: number;
  };
  recent_history: DriverDashboardMission[];
};

const DRIVER_ACTIVE_STATUSES: MissionStatus[] = [
  "ASSIGNED",
  "ACCEPTED",
  "ARRIVED",
  "LOADED",
  "IN_TRANSIT",
];

const HISTORY_STATUSES: MissionStatus[] = ["DELIVERED", "VERIFIED", "SETTLED"];

const PENDING_SETTLEMENT_PAYMENT: MissionPaymentState[] = [
  "PENDING",
  "CALCULATED",
  "HELD",
  "DISTRIBUTED",
  "FAILED",
];

function startOfLocalDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function mapDashboardMission(r: {
  id: bigint;
  status: MissionStatus;
  material_type_snapshot: string | null;
  completed_at: Date | null;
  load: {
    material_type: string;
    mine: { name: string };
    household: { village: { name: string } };
  };
}): DriverDashboardMission {
  return {
    id: toNum(r.id),
    status: r.status,
    origin: r.load.mine.name,
    destination: r.load.household.village.name,
    material_type: r.material_type_snapshot ?? r.load.material_type,
    ...(r.completed_at ? { completed_at: r.completed_at.toISOString() } : {}),
  };
}

function driverCodeFromId(driverId: number): string {
  return `DRV-${driverId}`;
}

/** WF-DASH-1: driver home state, active mission, summary, and brief history. */
export async function getDriverDashboard(driverId: number, mineId?: number): Promise<DriverDashboardData> {
  const driverRow = await prisma.drivers.findUnique({
    where: { id: toBig(driverId) },
    select: { full_name: true },
  });
  if (!driverRow) {
    throw new Error(`Driver ${driverId} not found`);
  }

  const driver: DriverDashboardDriver = {
    full_name: driverRow.full_name,
    driver_code: driverCodeFromId(driverId),
  };

  const mineFilter = mineId != null ? { load: { mine_id: toBig(mineId) } } : {};
  const rows = await prisma.missions.findMany({
    where: {
      driver_id: toBig(driverId),
      ...mineFilter,
    },
    include: {
      load: {
        include: {
          mine: true,
          household: { include: { village: true } },
        },
      },
    },
    orderBy: { updated_at: "desc" },
  });

  const dayStart = startOfLocalDay();
  let todayTrips = 0;
  let todayDeliveries = 0;
  let pendingSettlement = 0;

  for (const r of rows) {
    if (r.completed_at && r.completed_at >= dayStart) {
      todayTrips += 1;
      if (r.status === "DELIVERED" || r.status === "VERIFIED" || r.status === "SETTLED") {
        todayDeliveries += 1;
      }
    }
    if (
      (r.status === "DELIVERED" || r.status === "VERIFIED") &&
      PENDING_SETTLEMENT_PAYMENT.includes(r.payment_state)
    ) {
      pendingSettlement += 1;
    }
  }

  const summary = {
    today_trips: todayTrips,
    today_deliveries: todayDeliveries,
    today_km: 0,
    pending_settlement: pendingSettlement,
  };

  const awaiting = rows.find((r) => r.status === "DELIVERED");
  if (awaiting) {
    return {
      state: "AWAITING_WB",
      driver,
      active_mission: mapDashboardMission(awaiting),
      summary,
      recent_history: rows
        .filter((r) => r.id !== awaiting.id && HISTORY_STATUSES.includes(r.status))
        .slice(0, 5)
        .map(mapDashboardMission),
    };
  }

  const active = rows.find((r) => DRIVER_ACTIVE_STATUSES.includes(r.status));
  if (active) {
    return {
      state: "ACTIVE",
      driver,
      active_mission: mapDashboardMission(active),
      summary,
      recent_history: rows
        .filter((r) => r.id !== active.id && HISTORY_STATUSES.includes(r.status))
        .slice(0, 5)
        .map(mapDashboardMission),
    };
  }

  return {
    state: "IDLE",
    driver,
    summary,
    recent_history: rows.filter((r) => HISTORY_STATUSES.includes(r.status)).slice(0, 5).map(mapDashboardMission),
  };
}
