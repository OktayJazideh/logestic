import type { EntitiesStore, FleetOwner, Household } from "./entitiesStore";
import type { FinanceStore } from "./financeStore";
import * as hourlyRepo from "../repositories/hourlyWorkLogsRepository";
import * as missionsRepo from "../repositories/missionsRepository";
import * as auditRepo from "../repositories/auditLogsRepository";
import { ACTIVE_MISSION_STATUSES } from "../lib/missionFsm";
import { prisma } from "../db/prisma";
import { toBig, toNum } from "../repositories/id";

export type HourlyWorkLog = hourlyRepo.HourlyWorkLogRow;

export type OperatorHourlyAssignment = {
  mission_id: number;
  vehicle_id: number;
  household_id: number;
  equipment_label: string;
  need_id?: number;
  need_label?: string;
};

export class HourlyWorkLogStore {
  constructor(
    private entities: EntitiesStore,
    private finance: FinanceStore,
  ) {}

  async start(params: {
    mission_id: number;
    vehicle_id: number;
    household_id: number;
    start_photo_url: string;
    start_geo: hourlyRepo.GeoPoint;
    note?: string;
  }) {
    const mission = await missionsRepo.getMissionById(params.mission_id);
    if (!mission) return { ok: false as const, reason: "mission_not_found" };

    if (mission.vehicle_id !== params.vehicle_id) {
      return { ok: false as const, reason: "vehicle_mismatch" };
    }

    const active = await hourlyRepo.findActiveLogForMission(params.mission_id);
    if (active) return { ok: false as const, reason: "active_log_exists" };

    const household = this.entities.findHouseholdById(params.household_id) as Household | null;
    if (!household) return { ok: false as const, reason: "household_not_found" };

    const log = await hourlyRepo.createStartedLog({
      mission_id: params.mission_id,
      mine_id: mission.mine_id,
      fleet_owner_id: mission.owner_id,
      vehicle_id: params.vehicle_id,
      household_id: params.household_id,
      start_photo_url: params.start_photo_url,
      start_geo: params.start_geo,
      note: params.note,
    });

    return { ok: true as const, log };
  }

  async end(
    logId: number,
    params: { end_photo_url: string; end_geo: hourlyRepo.GeoPoint; note?: string },
  ) {
    const log = await hourlyRepo.endLog(logId, params);
    if (!log) return { ok: false as const, reason: "invalid_log_state" };
    return { ok: true as const, log };
  }

  async verify(params: {
    logId: number;
    consultantUserId: number;
    billable_hours: number;
    reason: string;
  }) {
    const log = await hourlyRepo.findHourlyLogById(params.logId);
    if (!log || log.status !== "ENDED") return { ok: false as const, reason: "invalid_log" };
    if (log.raw_hours == null) return { ok: false as const, reason: "missing_raw_hours" };
    if (params.billable_hours > log.raw_hours) return { ok: false as const, reason: "billable_exceeds_raw" };

    const rate = await this.finance.getHourlyRate(log.mine_id);
    if (!rate) return { ok: false as const, reason: "no_valid_rate_card" };

    const owner = this.entities.findFleetOwnerById(log.fleet_owner_id) as FleetOwner | null;
    const household = log.household_id
      ? (this.entities.findHouseholdById(log.household_id) as Household | null)
      : null;
    if (!owner || !household) return { ok: false as const, reason: "missing_entities" };

    const result = await prisma.$transaction(async (tx) => {
      const verified = await hourlyRepo.verifyLog(
        params.logId,
        {
          billable_hours: params.billable_hours,
          hourly_rate_snapshot: rate.rate,
          consultant_user_id: params.consultantUserId,
          verification_reason: params.reason,
        },
        tx,
      );
      if (!verified) throw new Error("verify_failed");

      const finance = await this.finance.creditHourlyShares(
        {
          mission_id: log.mission_id,
          mine_id: log.mine_id,
          hourly_log_id: log.id,
          owner,
          household,
          hours: params.billable_hours,
        },
        tx,
      );

      return { log: verified, finance };
    });

    return { ok: true as const, ...result };
  }

  async reject(params: { logId: number; consultantUserId: number; rejection_reason: string }) {
    const log = await hourlyRepo.findHourlyLogById(params.logId);
    if (!log) return { ok: false as const, reason: "invalid_log" };
    if (log.status === "APPROVED" || log.status === "REJECTED") {
      return { ok: false as const, reason: "already_finalized" };
    }
    if (log.status !== "ENDED" && log.status !== "PENDING") {
      return { ok: false as const, reason: "invalid_log_state" };
    }

    const operatorMembership = await prisma.user_workspace_memberships.findFirst({
      where: {
        mine_id: toBig(log.mine_id),
        role_in_workspace: "OPERATOR",
        status: "ACTIVE",
      },
      select: { user_id: true },
    });
    const operatorId = operatorMembership != null ? toNum(operatorMembership.user_id) : undefined;

    const result = await prisma.$transaction(async (tx) => {
      const rejected = await hourlyRepo.rejectLog(
        params.logId,
        {
          rejection_reason: params.rejection_reason,
          rejected_by_user_id: params.consultantUserId,
        },
        tx,
      );
      if (!rejected) throw new Error("reject_failed");

      await auditRepo.insertAuditLog(
        {
          entity_type: "hourly_work_log",
          entity_id: String(params.logId),
          action: "hourly_rejected",
          performed_by_user_id: params.consultantUserId,
          reason: params.rejection_reason,
          after_value: {
            reason: params.rejection_reason,
            hours: log.raw_hours,
            operator_id: operatorId,
          },
        },
        tx,
      );

      return { log: rejected };
    });

    return { ok: true as const, ...result };
  }

  listForMine(mineId?: number, status?: hourlyRepo.HourlyWorkLogRow["status"]) {
    return hourlyRepo.listForMine(mineId, status);
  }

  /** HOURLY-APP-1: operator mobile — active STARTED log or assignable missions at mine. */
  async getOperatorContext(mineId: number) {
    const startedLogs = await hourlyRepo.listForMine(mineId, "STARTED");
    const active = startedLogs[0];
    if (active) {
      const vehicle = active.vehicle_id != null ? this.entities.findVehicleById(active.vehicle_id) : null;
      return {
        active_log: {
          ...active,
          started_at: active.started_at?.toISOString(),
          equipment_label: vehicle?.license_plate ?? (active.vehicle_id != null ? `#${active.vehicle_id}` : "—"),
        },
        assignments: [] as OperatorHourlyAssignment[],
      };
    }

    const missionRows = await prisma.missions.findMany({
      where: {
        load: { mine_id: toBig(mineId) },
        status: { in: ACTIVE_MISSION_STATUSES },
      },
      include: {
        load: { include: { household: true } },
        vehicle: true,
      },
      orderBy: { created_at: "desc" },
      take: 25,
    });

    const hourlyNeed = await prisma.operation_needs.findFirst({
      where: {
        mine_id: toBig(mineId),
        status: { in: ["PENDING", "DISPATCHED"] },
        OR: [
          { operation_type: "HOURLY_EQUIPMENT" },
          { operation_type_catalog: { code: "HOURLY_EQUIPMENT" } },
        ],
      },
      orderBy: { created_at: "desc" },
      select: { id: true, equipment_type: true, location_text: true },
    });
    const needId = hourlyNeed != null ? toNum(hourlyNeed.id) : undefined;
    const needLabel = hourlyNeed?.equipment_type?.trim() || hourlyNeed?.location_text?.trim();

    const assignments: OperatorHourlyAssignment[] = [];
    for (const row of missionRows) {
      const missionId = toNum(row.id);
      const blocking = await hourlyRepo.findActiveLogForMission(missionId);
      if (blocking) continue;
      assignments.push({
        mission_id: missionId,
        vehicle_id: toNum(row.vehicle_id),
        household_id: toNum(row.load.household_id),
        equipment_label: row.vehicle.license_plate,
        need_id: needId,
        need_label: needLabel,
      });
    }

    return { active_log: null, assignments };
  }

  async listConsultantInbox(mineId?: number) {
    const logs = await hourlyRepo.listForMine(mineId, "ENDED");
    const operatorMembership = mineId
      ? await prisma.user_workspace_memberships.findFirst({
          where: {
            mine_id: toBig(mineId),
            role_in_workspace: "OPERATOR",
            status: "ACTIVE",
          },
          include: { user: { select: { mobile_number: true } } },
        })
      : null;
    const operatorLabel =
      operatorMembership?.user?.mobile_number ??
      (operatorMembership != null ? `اپراتور #${toNum(operatorMembership.user_id)}` : "—");

    return logs.map((log) => {
      const vehicle = log.vehicle_id != null ? this.entities.findVehicleById(log.vehicle_id) : null;
      return {
        ...log,
        duration_hours: log.raw_hours,
        operator_label: operatorLabel,
        equipment_label: vehicle?.license_plate ?? (log.vehicle_id != null ? `#${log.vehicle_id}` : "—"),
      };
    });
  }
}
