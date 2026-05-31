import type { MissionStatus } from "@prisma/client";
import { prisma } from "../db/prisma";
import * as kpiRepo from "../repositories/kpiRepository";
import * as communityPoolsRepo from "../repositories/communityPoolsRepository";
import { env } from "../config/env";
import { ACTIVE_MISSION_STATUSES } from "../lib/missionFsm";
import { fromDecimal } from "../repositories/decimal";

export const KPI_KEYS = [
  "fleet_efficiency",
  "assigned_missions",
  "verified_missions",
  "delay_pct",
  "delayed_missions",
  "hold_pct",
  "held_missions",
  "vehicle_utilization",
  "vehicles_used",
  "vehicles_pool",
  "failed_settlement",
] as const;

export type KpiKey = (typeof KPI_KEYS)[number];

function dayBounds(date: Date): { start: Date; end: Date; snapshotDate: Date } {
  const snapshotDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const start = snapshotDate;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, snapshotDate };
}

function missionMineFilter(mineId: number) {
  return { load: { mine_id: BigInt(mineId) } };
}

export async function computeDailyKpisForMine(mineId: number, date: Date) {
  const { start, end, snapshotDate } = dayBounds(date);
  const delayMs = env.KPI_DELAY_HOURS * 60 * 60 * 1000;

  const baseWhere = missionMineFilter(mineId);

  const assignedMissions = await prisma.missions.count({
    where: {
      ...baseWhere,
      status: { not: "CREATED" },
      OR: [
        { created_at: { gte: start, lt: end } },
        { updated_at: { gte: start, lt: end } },
      ],
    },
  });

  const verifiedMissions = await prisma.missions.count({
    where: {
      ...baseWhere,
      verified_at: { gte: start, lt: end },
    },
  });

  const fleetEfficiency = assignedMissions > 0 ? verifiedMissions / assignedMissions : 0;

  const verifiedWithStart = await prisma.missions.findMany({
    where: {
      ...baseWhere,
      verified_at: { gte: start, lt: end },
      started_at: { not: null },
    },
    select: { started_at: true, verified_at: true },
  });

  const delayedMissions = verifiedWithStart.filter((m) => {
    const started = m.started_at!.getTime();
    const verified = m.verified_at!.getTime();
    return verified - started > delayMs;
  }).length;

  const delayPct = verifiedMissions > 0 ? delayedMissions / verifiedMissions : 0;

  const activeMissionWhere = {
    ...baseWhere,
    OR: [
      { created_at: { gte: start, lt: end } },
      { updated_at: { gte: start, lt: end } },
      { verified_at: { gte: start, lt: end } },
    ],
  };

  const activeMissions = await prisma.missions.count({ where: activeMissionWhere });

  const heldMissions = await prisma.missions.count({
    where: {
      ...activeMissionWhere,
      OR: [{ payment_state: "HELD" }, { weighbridge_tickets: { status: "PENDING_HOLD" } }],
    },
  });
  const holdPct = activeMissions > 0 ? heldMissions / activeMissions : 0;

  const vehiclesUsedRows = await prisma.missions.findMany({
    where: {
      ...baseWhere,
      OR: [
        { created_at: { gte: start, lt: end } },
        { verified_at: { gte: start, lt: end } },
      ],
    },
    select: { vehicle_id: true },
    distinct: ["vehicle_id"],
  });
  const vehiclesUsed = vehiclesUsedRows.length;

  const poolSince = new Date(start.getTime() - 30 * 24 * 60 * 60 * 1000);
  const vehiclesPoolRows = await prisma.missions.findMany({
    where: {
      ...baseWhere,
      created_at: { gte: poolSince, lt: end },
    },
    select: { vehicle_id: true },
    distinct: ["vehicle_id"],
  });
  const vehiclesPool = Math.max(vehiclesPoolRows.length, vehiclesUsed, 1);
  const vehicleUtilization = vehiclesUsed / vehiclesPool;

  const failedBatches = await prisma.settlement_batches.count({
    where: {
      mine_id: BigInt(mineId),
      status: "FAILED",
      updated_at: { gte: start, lt: end },
    },
  });

  const failedPayments = await prisma.missions.count({
    where: {
      ...baseWhere,
      payment_state: "FAILED",
      updated_at: { gte: start, lt: end },
    },
  });

  const failedSettlement = failedBatches + failedPayments;

  const rows: kpiRepo.KpiSnapshotRow[] = [
    { snapshot_date: snapshotDate, mine_id: mineId, key: "fleet_efficiency", value: fleetEfficiency },
    { snapshot_date: snapshotDate, mine_id: mineId, key: "assigned_missions", value: assignedMissions },
    { snapshot_date: snapshotDate, mine_id: mineId, key: "verified_missions", value: verifiedMissions },
    { snapshot_date: snapshotDate, mine_id: mineId, key: "delay_pct", value: delayPct },
    { snapshot_date: snapshotDate, mine_id: mineId, key: "delayed_missions", value: delayedMissions },
    { snapshot_date: snapshotDate, mine_id: mineId, key: "hold_pct", value: holdPct },
    { snapshot_date: snapshotDate, mine_id: mineId, key: "held_missions", value: heldMissions },
    { snapshot_date: snapshotDate, mine_id: mineId, key: "vehicle_utilization", value: vehicleUtilization },
    { snapshot_date: snapshotDate, mine_id: mineId, key: "vehicles_used", value: vehiclesUsed },
    { snapshot_date: snapshotDate, mine_id: mineId, key: "vehicles_pool", value: vehiclesPool },
    { snapshot_date: snapshotDate, mine_id: mineId, key: "failed_settlement", value: failedSettlement },
  ];

  await kpiRepo.upsertSnapshots(rows);
  return { mine_id: mineId, snapshot_date: snapshotDate.toISOString().slice(0, 10), keys: rows.length };
}

export async function computeDailyKpis(date: Date, mineId?: number) {
  const mines =
    mineId != null
      ? [{ id: BigInt(mineId) }]
      : await prisma.mines.findMany({ select: { id: true } });

  const results = [];
  for (const mine of mines) {
    results.push(await computeDailyKpisForMine(Number(mine.id), date));
  }
  return { snapshot_date: dayBounds(date).snapshotDate.toISOString().slice(0, 10), mines: results };
}

export async function getKpiDashboard(params: { from: string; to: string; mine_id?: number }) {
  const from = new Date(`${params.from}T00:00:00.000Z`);
  const to = new Date(`${params.to}T00:00:00.000Z`);
  const rows = await kpiRepo.listSnapshots({ from, to, mine_id: params.mine_id });

  const byDate = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const bucket = byDate.get(row.snapshot_date) ?? {};
    bucket[row.key] = row.value;
    byDate.set(row.snapshot_date, bucket);
  }

  const series = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, metrics]) => ({ date, ...metrics }));

  const latest = series[series.length - 1] ?? null;
  return {
    period: { from: params.from, to: params.to, mine_id: params.mine_id },
    delay_threshold_hours: env.KPI_DELAY_HOURS,
    series,
    latest,
    raw_count: rows.length,
  };
}

export type OpsDashboardPayload = {
  missions_today: { created: number; verified: number; in_progress: number };
  weighbridge_pending: number;
  pool_current_rial: number;
  pool_period_key: string;
  holds_active: number;
  needs_pending_dispatch: number;
  missions_trend_7d: Array<{ date: string; created: number; verified: number }>;
  latest_missions: Array<{
    id: number;
    status: MissionStatus;
    driver_name: string;
    tons: number | null;
  }>;
  last_updated: string;
};

/** WF-OPS-DASH-1: single-mine operational snapshot (no cross-mine aggregates). */
export async function getOpsDashboard(mineId: number): Promise<OpsDashboardPayload> {
  const now = new Date();
  const { start: todayStart, end: todayEnd } = dayBounds(now);
  const baseWhere = missionMineFilter(mineId);

  const [createdToday, verifiedToday, inProgress, weighbridgePending, holdsActive, needsPending] =
    await Promise.all([
      prisma.missions.count({
        where: { ...baseWhere, created_at: { gte: todayStart, lt: todayEnd } },
      }),
      prisma.missions.count({
        where: { ...baseWhere, verified_at: { gte: todayStart, lt: todayEnd } },
      }),
      prisma.missions.count({
        where: {
          ...baseWhere,
          status: { in: ACTIVE_MISSION_STATUSES },
        },
      }),
      prisma.weighbridge_tickets.count({
        where: {
          status: { in: ["PENDING_HOLD", "LOADED_REGISTERED"] },
          mission: baseWhere,
        },
      }),
      prisma.missions.count({
        where: {
          ...baseWhere,
          OR: [
            { payment_state: "HELD" },
            { weighbridge_tickets: { status: "PENDING_HOLD" } },
          ],
        },
      }),
      prisma.operation_needs.count({
        where: { mine_id: BigInt(mineId), status: "PENDING", deleted_at: null },
      }),
    ]);

  const poolPeriodKey = now.toISOString().slice(0, 7);
  const pool = await communityPoolsRepo.findPoolByMinePeriod(mineId, poolPeriodKey);

  const trend: OpsDashboardPayload["missions_trend_7d"] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const { start, end } = dayBounds(d);
    const dateStr = start.toISOString().slice(0, 10);
    const [created, verified] = await Promise.all([
      prisma.missions.count({
        where: { ...baseWhere, created_at: { gte: start, lt: end } },
      }),
      prisma.missions.count({
        where: { ...baseWhere, verified_at: { gte: start, lt: end } },
      }),
    ]);
    trend.push({ date: dateStr, created, verified });
  }

  const latestRows = await prisma.missions.findMany({
    where: baseWhere,
    orderBy: { updated_at: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      driver: { select: { full_name: true } },
      load: { select: { quantity_tons: true } },
      weighbridge_tickets: { select: { net_weight: true } },
    },
  });

  const latest_missions = latestRows.map((m) => {
    const tons =
      m.weighbridge_tickets != null
        ? fromDecimal(m.weighbridge_tickets.net_weight)
        : m.load.quantity_tons != null
          ? fromDecimal(m.load.quantity_tons)
          : null;
    return {
      id: Number(m.id),
      status: m.status,
      driver_name: m.driver.full_name,
      tons,
    };
  });

  return {
    missions_today: {
      created: createdToday,
      verified: verifiedToday,
      in_progress: inProgress,
    },
    weighbridge_pending: weighbridgePending,
    pool_current_rial: pool?.total_amount ?? 0,
    pool_period_key: poolPeriodKey,
    holds_active: holdsActive,
    needs_pending_dispatch: needsPending,
    missions_trend_7d: trend,
    latest_missions,
    last_updated: now.toISOString(),
  };
}
