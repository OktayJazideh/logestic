import type { MissionPaymentState, MissionStatus } from "@prisma/client";
import { prisma } from "../db/prisma";
import { fromDecimal } from "./decimal";
import { toBig, toNum } from "./id";
import * as walletsRepo from "./walletsRepository";

const IN_PROGRESS_STATUSES: MissionStatus[] = [
  "CREATED",
  "ASSIGNED",
  "ACCEPTED",
  "ARRIVED",
  "LOADED",
  "IN_TRANSIT",
  "DELIVERED",
];

const PENDING_PAYMENT: MissionPaymentState[] = ["PENDING", "CALCULATED", "HELD", "DISTRIBUTED", "FAILED"];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function monthBounds(d = new Date()) {
  return {
    start: new Date(d.getFullYear(), d.getMonth(), 1),
    end: new Date(d.getFullYear(), d.getMonth() + 1, 1),
  };
}

function ownerMineWhere(ownerId: number, mineId: number) {
  return {
    owner_id: toBig(ownerId),
    load: { mine_id: toBig(mineId) },
  };
}

function missionAmounts(transactions: Array<{ type: string; amount: { toString(): string }; wallet: { wallet_type: string } }>) {
  let owner_amount_rial = 0;
  let operational_fare_rial = 0;
  for (const t of transactions) {
    const amt = walletsRepo.transactionBalanceDelta(
      t.type as "CREDIT" | "DEBIT" | "POOL_DISTRIBUTION",
      fromDecimal(t.amount),
    );
    if (t.wallet.wallet_type === "OWNER") owner_amount_rial += amt;
    if (t.wallet.wallet_type === "OWNER" || t.wallet.wallet_type === "PLATFORM") {
      operational_fare_rial += amt;
    }
  }
  return {
    owner_amount_rial: round2(owner_amount_rial),
    operational_fare_rial: round2(operational_fare_rial),
  };
}

export type FleetOwnerSummary = {
  verified_missions_count: number;
  missions_in_progress: number;
  pending_settlement_rial: number;
  paid_this_month_rial: number;
  wallet_balance_rial: number;
};

export async function getFleetOwnerSummary(ownerId: number, mineId: number): Promise<FleetOwnerSummary> {
  const missions = await prisma.missions.findMany({
    where: ownerMineWhere(ownerId, mineId),
    include: {
      transactions: { include: { wallet: { select: { wallet_type: true } } } },
    },
  });

  let verified_missions_count = 0;
  let missions_in_progress = 0;
  let pending_settlement_rial = 0;

  for (const m of missions) {
    if (m.status === "VERIFIED" || m.status === "SETTLED") verified_missions_count += 1;
    if (IN_PROGRESS_STATUSES.includes(m.status)) missions_in_progress += 1;

    if (
      (m.status === "VERIFIED" || m.status === "SETTLED") &&
      PENDING_PAYMENT.includes(m.payment_state)
    ) {
      const { owner_amount_rial } = missionAmounts(m.transactions);
      pending_settlement_rial += owner_amount_rial;
    }
  }

  const { start, end } = monthBounds();
  const wallet = await walletsRepo.findWalletForOwner(ownerId);
  let paid_this_month_rial = 0;
  let wallet_balance_rial = 0;

  if (wallet) {
    const txs = await prisma.transactions.findMany({
      where: {
        wallet_id: toBig(wallet.id),
        OR: [
          { mission_id: null },
          { mission: { load: { mine_id: toBig(mineId) } } },
        ],
      },
      include: {
        mission: { include: { load: { select: { mine_id: true } } } },
      },
    });

    for (const t of txs) {
      const delta = walletsRepo.transactionBalanceDelta(t.type, fromDecimal(t.amount));
      wallet_balance_rial += delta;
      if (
        t.type === "CREDIT" &&
        t.created_at >= start &&
        t.created_at < end &&
        (t.mission_id == null || (t.mission && toNum(t.mission.load.mine_id) === mineId))
      ) {
        paid_this_month_rial += fromDecimal(t.amount);
      }
    }
  }

  return {
    verified_missions_count,
    missions_in_progress,
    pending_settlement_rial: round2(pending_settlement_rial),
    paid_this_month_rial: round2(paid_this_month_rial),
    wallet_balance_rial: round2(wallet_balance_rial),
  };
}

export type FleetOwnerVehicleRow = {
  id: number;
  plate: string;
  status: string;
  driver_name: string | null;
  capacity_tons: number;
  last_mission_at: string | null;
};

export async function listFleetOwnerVehicles(ownerId: number, mineId: number): Promise<FleetOwnerVehicleRow[]> {
  const vehicles = await prisma.vehicles.findMany({
    where: { owner_id: toBig(ownerId), deleted_at: null },
    orderBy: { id: "asc" },
  });

  const rows: FleetOwnerVehicleRow[] = [];
  for (const v of vehicles) {
    const lastMission = await prisma.missions.findFirst({
      where: {
        vehicle_id: v.id,
        owner_id: toBig(ownerId),
        load: { mine_id: toBig(mineId) },
      },
      orderBy: { created_at: "desc" },
      include: { driver: true },
    });

    rows.push({
      id: toNum(v.id),
      plate: v.license_plate,
      status: v.status,
      driver_name: lastMission?.driver.full_name ?? null,
      capacity_tons: Number(v.capacity_tons),
      last_mission_at: lastMission?.created_at.toISOString() ?? null,
    });
  }
  return rows;
}

export type FleetOwnerMissionRow = {
  mission_id: number;
  status: MissionStatus;
  verified_net_tons: number;
  operational_fare_rial: number;
  owner_amount_rial: number;
  paid: boolean;
  created_at: string;
};

export async function listFleetOwnerMissions(
  ownerId: number,
  mineId: number,
  opts: { status?: MissionStatus; limit: number; offset: number },
): Promise<FleetOwnerMissionRow[]> {
  const rows = await prisma.missions.findMany({
    where: {
      ...ownerMineWhere(ownerId, mineId),
      ...(opts.status ? { status: opts.status } : {}),
    },
    include: {
      transactions: { include: { wallet: { select: { wallet_type: true } } } },
    },
    orderBy: { created_at: "desc" },
    take: opts.limit,
    skip: opts.offset,
  });

  return rows.map((m) => {
    const { owner_amount_rial, operational_fare_rial } = missionAmounts(m.transactions);
    const netKg = m.verified_net_tons_kg != null ? fromDecimal(m.verified_net_tons_kg) : 0;
    return {
      mission_id: toNum(m.id),
      status: m.status,
      verified_net_tons: round2(netKg / 1000),
      operational_fare_rial,
      owner_amount_rial,
      paid: m.payment_state === "SETTLED",
      created_at: m.created_at.toISOString(),
    };
  });
}
