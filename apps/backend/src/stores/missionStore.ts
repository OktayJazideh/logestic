import type { EntitiesStore, Household, FleetOwner } from "./entitiesStore";
import type { FinanceStore } from "./financeStore";
import type { AuditLogRecord, AuditLogStore } from "./auditLogStore";
import { prisma } from "../db/prisma";
import * as loadsRepo from "../repositories/loadsRepository";
import * as missionsRepo from "../repositories/missionsRepository";
import * as weighbridgeRepo from "../repositories/weighbridgeRepository";
import {
  CommunityRequiresVerifiedWeightError,
} from "../repositories/financeLedgerRepository";
import * as ledgerRepo from "../repositories/financeLedgerRepository";
import * as auditRepo from "../repositories/auditLogsRepository";
import { toDecimal } from "../repositories/decimal";
import { isWeighbridgeAnomaly } from "../lib/weighbridgeAnomaly";
import { publishEvent } from "../services/eventBus";
import { ruleEngine } from "../services/ruleEngine";
import {
  type DriverStepTarget,
  type MissionTransitionActor,
  validateTransition,
} from "../lib/missionFsm";
import { haversineDistanceMeters, isWithinGeofence } from "../lib/geofence";
import { isDevAuthEnabled } from "../config/env";
import { resolveGeofenceForMissionStep } from "../services/geofenceService";
import type { MissionStatus } from "@prisma/client";
import { normalizeRole, type UserRole } from "../types/userRole";

export type LoadStatus = "PENDING" | "IN_TRANSIT" | "DELIVERED" | "CANCELED";

export type MissionPaymentState = "PENDING" | "CALCULATED" | "DISTRIBUTED" | "SETTLED" | "HELD" | "FAILED";
export type { MissionStatus };

export type WeighbridgeTicketStatus =
  | "PENDING_EMPTY"
  | "EMPTY_REGISTERED"
  | "LOADED_REGISTERED"
  | "PENDING_HOLD"
  | "APPROVED"
  | "REJECTED"
  | "ADJUSTED";

export type Load = {
  id: number;
  load_tracking_code: string;
  mine_id: number;
  household_id: number;
  owner_id: number;
  material_type: string;
  quantity_tons: number;
  status: LoadStatus;
};

export type Mission = {
  id: number;
  load_id: number;
  mine_id: number;
  owner_id: number;
  driver_id: number;
  vehicle_id: number;
  status: MissionStatus;
  payment_state: MissionPaymentState;
  rate_per_ton_snapshot?: number;
  completedByDriverAt?: Date;
  verified_at?: Date;
  created_at: Date;
  updated_at: Date;
};

export type WeighbridgeManualReasonCode = "SCALE_DOWN" | "NETWORK" | "OTHER";

export type WeighbridgeTicket = {
  id: number;
  mission_id: number;
  load_id: number;
  ticket_number: string;
  status: WeighbridgeTicketStatus;
  empty_weight?: number;
  loaded_weight?: number;
  net_weight?: number;
  entry_source?: string | null;
  entry_note?: string | null;
  reason_code?: WeighbridgeManualReasonCode | null;
  requires_supervisor_approve?: boolean;
  created_at: Date;
  updated_at: Date;
};

export type WeighbridgeAdjustmentRequest = {
  id: number;
  ticket_id: number;
  mission_id: number;
  reason: string;
  before_net: number;
  after_net: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requested_by_user_id: number;
  approved_by_user_id?: number;
  rejected_by_user_id?: number;
  created_at: Date;
};

export type WeighbridgeWeightEntrySource = "OPERATOR" | "AGENT" | "MANUAL";

function toLoad(row: loadsRepo.LoadRow, owner_id: number, quantity_tons?: number): Load {
  return {
    id: row.id,
    load_tracking_code: row.load_tracking_code,
    mine_id: row.mine_id,
    household_id: row.household_id,
    owner_id,
    material_type: row.material_type,
    quantity_tons: quantity_tons ?? row.quantity_tons ?? 0,
    status: row.status as LoadStatus,
  };
}

function toMission(row: missionsRepo.MissionRow): Mission {
  return {
    id: row.id,
    load_id: row.load_id,
    mine_id: row.mine_id,
    owner_id: row.owner_id,
    driver_id: row.driver_id,
    vehicle_id: row.vehicle_id,
    status: row.status as MissionStatus,
    payment_state: row.payment_state as MissionPaymentState,
    rate_per_ton_snapshot: row.rate_per_ton_snapshot,
    completedByDriverAt: row.completed_at,
    verified_at: row.verified_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toTicket(row: weighbridgeRepo.WeighbridgeTicketRow, load_id: number): WeighbridgeTicket {
  return {
    id: row.id,
    mission_id: row.mission_id,
    load_id,
    ticket_number: row.ticket_number,
    status: row.status as WeighbridgeTicketStatus,
    empty_weight: row.empty_weight,
    loaded_weight: row.loaded_weight,
    net_weight: row.net_weight,
    entry_source: row.entry_source ?? null,
    entry_note: row.entry_note ?? null,
    reason_code: row.reason_code ?? null,
    requires_supervisor_approve: row.requires_supervisor_approve,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toAdjustment(row: weighbridgeRepo.WeighbridgeAdjustmentRow): WeighbridgeAdjustmentRequest {
  return {
    id: row.id,
    ticket_id: row.ticket_id,
    mission_id: row.mission_id,
    reason: row.reason,
    before_net: row.before_net,
    after_net: row.after_net,
    status: row.status as WeighbridgeAdjustmentRequest["status"],
    requested_by_user_id: row.requested_by_user_id,
    approved_by_user_id: row.approved_by_user_id,
    created_at: row.created_at,
  };
}

async function periodKey(mine_id?: number, cooperative_id?: number) {
  const { ruleEngine } = await import("../services/ruleEngine");
  return ruleEngine.getPeriodKey(new Date(), { mineId: mine_id, cooperativeId: cooperative_id });
}

export class MissionStore {
  constructor(
    private entities: EntitiesStore,
    private finance: FinanceStore,
    private audit: AuditLogStore,
  ) {}

  async listDriverMissions(driverId: number, mineId?: number) {
    const rows = await missionsRepo.listDriverMissions(driverId, mineId);
    return rows.map(toMission);
  }

  listDriverMissionsForApi(driverId: number, mineId?: number) {
    return missionsRepo.listDriverMissionsForApi(driverId, mineId);
  }

  getDriverMissionForApi(driverId: number, missionId: number, mineId?: number) {
    return missionsRepo.getDriverMissionForApi(driverId, missionId, mineId);
  }

  getDriverDashboard(driverId: number, mineId?: number) {
    return missionsRepo.getDriverDashboard(driverId, mineId);
  }

  async getMission(missionId: number) {
    const row = await missionsRepo.getMissionById(missionId);
    return row ? toMission(row) : null;
  }

  async getTicketForMission(missionId: number) {
    const row = await weighbridgeRepo.getTicketByMissionId(missionId);
    if (!row) return null;
    const mission = await missionsRepo.getMissionById(missionId);
    return mission ? toTicket(row, mission.load_id) : null;
  }

  /** WF-WB-READ-1: read-only weighbridge status for driver app. */
  async getDriverWeighbridgeStatus(missionId: number) {
    const mission = await missionsRepo.getMissionById(missionId);
    if (!mission) return null;
    const ticket = await weighbridgeRepo.getTicketByMissionId(missionId);
    const { buildDriverWeighbridgeStatus } = await import("../lib/driverWeighbridgeStatus");
    return buildDriverWeighbridgeStatus({
      ticket,
      payment_state: mission.payment_state as MissionPaymentState,
    });
  }

  async listTickets(params?: { status?: WeighbridgeTicketStatus; mineId?: number }) {
    const rows = await weighbridgeRepo.listTickets(params);
    const out: WeighbridgeTicket[] = [];
    for (const r of rows) {
      const mission = await missionsRepo.getMissionById(r.mission_id);
      if (mission) out.push(toTicket(r, mission.load_id));
    }
    return out;
  }

  async getLoadById(loadId: number, owner_id?: number, quantity_tons = 0) {
    const row = await loadsRepo.getLoadById(loadId);
    if (!row) return null;
    const mission = await prisma.missions.findFirst({ where: { load_id: BigInt(loadId) } });
    const oid = owner_id ?? (mission ? Number(mission.owner_id) : 0);
    return toLoad(row, oid, quantity_tons);
  }

  async createDemoLoadAndMission(params: {
    mine_id: number;
    household_id: number;
    owner_id: number;
    driver_id: number;
    vehicle_id: number;
    material_type: string;
    quantity_tons: number;
  }) {
    const suffix = Math.random().toString(16).slice(2, 8).toUpperCase();
    const loadRow = await loadsRepo.createLoad({
      load_tracking_code: `LOAD-${Date.now()}-${suffix}`,
      mine_id: params.mine_id,
      household_id: params.household_id,
      material_type: params.material_type,
      quantity_tons: params.quantity_tons,
      status: "IN_TRANSIT",
    });
    const missionRow = await missionsRepo.createMission({
      load_id: loadRow.id,
      owner_id: params.owner_id,
      driver_id: params.driver_id,
      vehicle_id: params.vehicle_id,
      material_type_snapshot: params.material_type,
    });
    const assigned = await missionsRepo.assignMissionFromDispatch(missionRow.id);
    const load = toLoad(loadRow, params.owner_id);
    const mission = toMission(assigned ?? missionRow);
    return { load, mission };
  }

  async systemAssignMission(missionId: number) {
    return this.transitionMission(missionId, "ASSIGNED", "DISPATCH");
  }

  async transitionMission(missionId: number, to: MissionStatus, actor: MissionTransitionActor) {
    const mission = await this.getMission(missionId);
    if (!mission) return { ok: false as const, reason: "mission_not_found" };
    const check = validateTransition(mission.status, to, actor);
    if (!check.ok) return check;

    const updated = await missionsRepo.updateMission(missionId, {
      status: to,
      completed_at: to === "DELIVERED" ? new Date() : undefined,
    });
    if (!updated) return { ok: false as const, reason: "update_failed" };
    return { ok: true as const, mission: toMission(updated) };
  }

  async driverUpdateStep(params: {
    missionId: number;
    driverId: number;
    step: DriverStepTarget;
    latitude?: number;
    longitude?: number;
    accuracy_m?: number;
    distance_m?: number;
    receipt_photo_url?: string;
    receipt_photo_base64?: string;
  }) {
    const mission = await this.getMission(params.missionId);
    if (!mission) return { ok: false as const, reason: "mission_not_found" };
    if (mission.driver_id !== params.driverId) return { ok: false as const, reason: "forbidden" };

    const check = validateTransition(mission.status, params.step, "DRIVER");
    if (!check.ok) return check;

    if ((params.step === "ARRIVED" || params.step === "DELIVERED") && (params.latitude == null || params.longitude == null)) {
      return { ok: false as const, reason: "location_required" };
    }

    if ((params.step === "ARRIVED" || params.step === "DELIVERED") && !isDevAuthEnabled()) {
      const fence = await resolveGeofenceForMissionStep({
        mineId: mission.mine_id,
        step: params.step,
      });
      if (!fence) {
        return { ok: false as const, reason: "geofence_not_configured" };
      }
      const lat = params.latitude!;
      const lng = params.longitude!;
      const computedDistance = haversineDistanceMeters(lat, lng, fence.lat, fence.lng);
      if (!isWithinGeofence({ lat, lng, centerLat: fence.lat, centerLng: fence.lng, radiusM: fence.radius_m })) {
        return {
          ok: false as const,
          reason: "outside_geofence",
          distance_m: computedDistance,
          radius_m: fence.radius_m,
        };
      }
    }

    if (params.step === "LOADED") {
      const ticket = await weighbridgeRepo.getTicketByMissionId(mission.id);
      if (!ticket) return { ok: false as const, reason: "weighbridge_ticket_required" };
      if (
        ticket.status !== "EMPTY_REGISTERED" &&
        ticket.status !== "LOADED_REGISTERED" &&
        ticket.status !== "PENDING_HOLD"
      ) {
        return { ok: false as const, reason: "weighbridge_weights_required" };
      }
    }

    if (params.step === "ARRIVED") {
      const existing = await weighbridgeRepo.getTicketByMissionId(mission.id);
      if (!existing) {
        await weighbridgeRepo.createTicket({
          mission_id: mission.id,
          ticket_number: `WB-${mission.id}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`,
        });
      }
    }

    const updated = await missionsRepo.updateMission(params.missionId, {
      status: params.step,
      completed_at: params.step === "DELIVERED" ? new Date() : undefined,
    });
    if (!updated) return { ok: false as const, reason: "update_failed" };

    if (params.step === "ACCEPTED") {
      await publishEvent("mission.accepted", {
        mission_id: mission.id,
        driver_id: params.driverId,
        status: params.step,
      }, { published_by: params.driverId });
    }
    if (params.step === "DELIVERED") {
      await publishEvent(
        "mission.delivered",
        {
          mission_id: mission.id,
          driver_id: params.driverId,
          latitude: params.latitude,
          longitude: params.longitude,
          ...(params.receipt_photo_url ? { receipt_photo_url: params.receipt_photo_url } : {}),
          ...(params.receipt_photo_base64
            ? { receipt_photo_base64: params.receipt_photo_base64.slice(0, 120) + "…" }
            : {}),
        },
        { published_by: params.driverId },
      );
    }

    return { ok: true as const, mission: toMission(updated) };
  }

  async settleMissionFromEngine(missionId: number, tx?: Parameters<typeof missionsRepo.settleVerifiedMission>[1]) {
    const row = await missionsRepo.getMissionById(missionId, tx);
    if (!row) return { ok: false as const, reason: "mission_not_found" };
    const check = validateTransition(row.status, "SETTLED", "SETTLEMENT_ENGINE");
    if (!check.ok) return check;
    const updated = await missionsRepo.settleVerifiedMission(missionId, tx);
    if (!updated) return { ok: false as const, reason: "update_failed" };
    if (!tx) {
      await publishEvent("mission.settled", { mission_id: missionId, status: "SETTLED" });
    }
    return { ok: true as const, mission: toMission(updated) };
  }

  async weighbridgeApprove(params: {
    ticketId: number;
    approvedByUserId: number;
    approverRole: string;
  }) {
    const ticketRow = await weighbridgeRepo.getTicketById(params.ticketId);
    if (!ticketRow) return { ok: false as const, reason: "ticket_not_found" };
    if (ticketRow.status === "APPROVED") return { ok: false as const, reason: "already_approved" };
    if (ticketRow.status === "REJECTED") return { ok: false as const, reason: "ticket_rejected" };
    if (ticketRow.status !== "LOADED_REGISTERED" && ticketRow.status !== "PENDING_HOLD") {
      return { ok: false as const, reason: "weights_required" };
    }
    if (ticketRow.requires_supervisor_approve && normalizeRole(params.approverRole as UserRole) !== "OPERATION_ADMIN") {
      return { ok: false as const, reason: "supervisor_approval_required" };
    }

    const missionRow = await missionsRepo.getMissionById(ticketRow.mission_id);
    if (!missionRow) return { ok: false as const, reason: "mission_missing" };
    if (missionRow.status !== "DELIVERED") {
      return { ok: false as const, reason: "invalid_transition" };
    }
    const loadRow = await loadsRepo.getLoadById(missionRow.load_id);
    if (!loadRow) return { ok: false as const, reason: "load_missing" };

    const owner = this.entities.findFleetOwnerById(missionRow.owner_id) as FleetOwner | null;
    const household = this.entities.findHouseholdById(loadRow.household_id) as Household | null;
    if (!owner || !household) return { ok: false as const, reason: "missing_entities" };

    const prevTicketStatus = ticketRow.status;
    const prevMissionStatus = missionRow.status;

    // net_weight is stored in kg (loaded − empty); fare and splits use metric tons.
    const qtyTons = ticketRow.net_weight > 0 ? ticketRow.net_weight / 1000 : 0;
    if (qtyTons <= 0) return { ok: false as const, reason: "weights_required" };

    let fare: { totalFare: number; rate: number; rate_card_id?: number };
    try {
      fare = await this.finance.computeFareTonnage(
        qtyTons,
        loadRow.material_type,
        loadRow.mine_id,
        household.cooperative_id,
      );
    } catch {
      return { ok: false as const, reason: "no_valid_rate_card" };
    }

    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
      await tx.weighbridge_tickets.update({
        where: { id: BigInt(params.ticketId) },
        data: {
          status: "APPROVED",
          approved_by_user_id: BigInt(params.approvedByUserId),
          requires_supervisor_approve: false,
        },
      });
      await tx.missions.update({
        where: { id: BigInt(ticketRow.mission_id) },
        data: {
          status: "VERIFIED",
          verified_at: new Date(),
          payment_state: "DISTRIBUTED",
          ...(fare.rate_card_id != null ? { rate_card_id: BigInt(fare.rate_card_id) } : {}),
          rate_per_ton_snapshot: toDecimal(fare.rate),
        },
      });

      const financeRes = await this.finance.creditMissionShares(
        {
          mission_id: ticketRow.mission_id,
          mine_id: loadRow.mine_id,
          owner,
          household,
          material_type: loadRow.material_type,
          quantity_tons: qtyTons,
          verified_net_tons_kg: ticketRow.net_weight,
        },
        tx,
      );

      await auditRepo.insertAuditLog(
        {
          entity_type: "weighbridge_ticket",
          entity_id: String(params.ticketId),
          action: "APPROVED",
          before_value: { ticket_status: prevTicketStatus, mission_status: prevMissionStatus },
          after_value: {
            ticket_status: "APPROVED",
            mission_status: "VERIFIED",
            net_weight: qtyTons,
          },
          performed_by_user_id: params.approvedByUserId,
          reason: "weighbridge_approve",
        },
        tx,
      );

      return financeRes;
      });
    } catch (e) {
      if (e instanceof CommunityRequiresVerifiedWeightError) {
        return { ok: false as const, reason: "community_requires_verified_weight" };
      }
      throw e;
    }

    const ticket = await weighbridgeRepo.getTicketById(params.ticketId);
    const mission = await this.getMission(ticketRow.mission_id);
    const load = await this.getLoadById(missionRow.load_id, missionRow.owner_id, qtyTons);

    await publishEvent(
      "weighbridge.approved",
      {
        ticket_id: params.ticketId,
        mission_id: ticketRow.mission_id,
        net_weight: qtyTons,
        approved_by_user_id: params.approvedByUserId,
      },
      { published_by: params.approvedByUserId },
    );
    await publishEvent(
      "mission.verified",
      {
        mission_id: ticketRow.mission_id,
        ticket_id: params.ticketId,
        net_weight: qtyTons,
      },
      { published_by: params.approvedByUserId },
    );

    return {
      ok: true as const,
      ticket: ticket ? toTicket(ticket, missionRow.load_id) : null,
      mission: mission!,
      load: load!,
      finance: result,
    };
  }

  async holdMissionPayment(params: { missionId: number; reason: string; userId: number }) {
    const mission = await this.getMission(params.missionId);
    if (!mission) return { ok: false as const, reason: "mission_not_found" };
    if (mission.payment_state === "SETTLED") return { ok: false as const, reason: "already_settled" };

    const prev = mission.payment_state;
    const updated = await missionsRepo.updateMission(params.missionId, { payment_state: "HELD" });
    if (!updated) return { ok: false as const, reason: "update_failed" };

    await this.audit.record({
      entity_type: "mission_payment",
      entity_id: String(mission.id),
      action: "HOLD",
      before_value: { payment_state: prev },
      after_value: { payment_state: "HELD" },
      performed_by_user_id: params.userId,
      reason: params.reason,
    });
    await publishEvent(
      "payment.hold",
      { mission_id: mission.id, reason: params.reason },
      { published_by: params.userId },
    );
    return { ok: true as const, mission: toMission(updated) };
  }

  async releaseMissionPayment(params: { missionId: number; reason: string; userId: number }) {
    const mission = await this.getMission(params.missionId);
    if (!mission) return { ok: false as const, reason: "mission_not_found" };
    if (mission.payment_state !== "HELD") return { ok: false as const, reason: "mission_not_held" };

    const prev = mission.payment_state;
    const updated = await missionsRepo.updateMission(params.missionId, { payment_state: "DISTRIBUTED" });
    if (!updated) return { ok: false as const, reason: "update_failed" };

    await this.audit.record({
      entity_type: "mission_payment",
      entity_id: String(mission.id),
      action: "RELEASE",
      before_value: { payment_state: prev },
      after_value: { payment_state: "DISTRIBUTED" },
      performed_by_user_id: params.userId,
      reason: params.reason,
    });
    await publishEvent(
      "payment.release",
      { mission_id: mission.id, reason: params.reason },
      { published_by: params.userId },
    );
    return { ok: true as const, mission: toMission(updated) };
  }

  async reverseMissionPayment(params: { missionId: number; reason: string; userId: number }) {
    const mission = await this.getMission(params.missionId);
    if (!mission) return { ok: false as const, reason: "mission_not_found" };
    if (mission.status === "SETTLED" || mission.payment_state === "SETTLED") {
      return { ok: false as const, reason: "cannot_reverse_settled" };
    }
    if (!mission.verified_at) {
      return { ok: false as const, reason: "not_verified" };
    }

    const windowHours = await ruleEngine.getNumber("reverse.window_hours", { mineId: mission.mine_id });
    const elapsedMs = Date.now() - mission.verified_at.getTime();
    if (elapsedMs > windowHours * 60 * 60 * 1000) {
      return { ok: false as const, reason: "reverse_window_expired", window_hours: windowHours };
    }

    const prev = mission.payment_state;
    const updated = await missionsRepo.updateMission(params.missionId, {
      payment_state: "FAILED",
    });
    if (!updated) return { ok: false as const, reason: "update_failed" };

    await this.audit.record({
      entity_type: "mission_payment",
      entity_id: String(mission.id),
      action: "REVERSAL",
      before_value: { payment_state: prev, mission_status: mission.status, verified_at: mission.verified_at },
      after_value: { payment_state: "FAILED", mission_status: mission.status },
      performed_by_user_id: params.userId,
      reason: params.reason,
    });
    await publishEvent(
      "payment.reverse",
      {
        mission_id: mission.id,
        reason: params.reason,
        performed_by_user_id: params.userId,
      },
      { published_by: params.userId },
    );
    await publishEvent(
      "payment.failed",
      { mission_id: mission.id, reason: params.reason, via: "reversal" },
      { published_by: params.userId },
    );
    return { ok: true as const, mission: toMission(updated) };
  }

  async createPostSettledAdjustment(params: {
    missionId: number;
    reason: string;
    bank_reference?: string;
    userId: number;
  }) {
    const mission = await this.getMission(params.missionId);
    if (!mission) return { ok: false as const, reason: "mission_not_found" };
    if (mission.status !== "SETTLED") {
      return { ok: false as const, reason: "mission_not_settled" };
    }

    await this.audit.record({
      entity_type: "mission_post_settled_adjustment",
      entity_id: String(mission.id),
      action: "POST_SETTLED_ADJUSTMENT",
      before_value: { mission_status: mission.status, payment_state: mission.payment_state },
      after_value: {
        mission_status: mission.status,
        payment_state: mission.payment_state,
        bank_reference: params.bank_reference ?? null,
      },
      performed_by_user_id: params.userId,
      reason: params.reason,
    });
    return {
      ok: true as const,
      adjustment: {
        mission_id: mission.id,
        reason: params.reason,
        bank_reference: params.bank_reference,
      },
    };
  }

  async weighbridgeRejectTicket(params: { ticketId: number; reason: string; rejectedByUserId: number }) {
    const ticketRow = await weighbridgeRepo.getTicketById(params.ticketId);
    if (!ticketRow) return { ok: false as const, reason: "ticket_not_found" };
    if (ticketRow.status === "APPROVED" || ticketRow.status === "ADJUSTED") {
      return { ok: false as const, reason: "already_credited_use_adjustment" };
    }
    if (ticketRow.status === "REJECTED") return { ok: false as const, reason: "already_rejected" };

    const missionRow = await missionsRepo.getMissionById(ticketRow.mission_id);
    if (!missionRow) return { ok: false as const, reason: "mission_missing" };

    const prev = { ticket_status: ticketRow.status, mission_status: missionRow.status };

    await prisma.$transaction(async (tx) => {
      await tx.weighbridge_tickets.update({
        where: { id: BigInt(params.ticketId) },
        data: { status: "REJECTED" },
      });
      await auditRepo.insertAuditLog(
        {
          entity_type: "weighbridge_ticket",
          entity_id: String(params.ticketId),
          action: "REJECTED",
          before_value: prev,
          after_value: { ticket_status: "REJECTED", mission_status: missionRow.status },
          performed_by_user_id: params.rejectedByUserId,
          reason: params.reason,
        },
        tx,
      );
    });

    const ticket = await weighbridgeRepo.getTicketById(params.ticketId);
    const mission = await this.getMission(ticketRow.mission_id);
    return {
      ok: true as const,
      ticket: ticket ? toTicket(ticket, missionRow.load_id) : null,
      mission: mission!,
    };
  }

  async getWeighbridgeTicketAuditTrail(ticketId: number): Promise<AuditLogRecord[]> {
    const ticketLogs = await auditRepo.listAuditLogsByEntity("weighbridge_ticket", String(ticketId));
    const adjs = await prisma.weighbridge_adjustment_requests.findMany({
      where: { ticket_id: BigInt(ticketId) },
    });
    const adjLogs = (
      await Promise.all(
        adjs.map((a) => auditRepo.listAuditLogsByEntity("weighbridge_adjustment", String(a.id))),
      )
    ).flat();
    const merged = [...ticketLogs, ...adjLogs].map((l) => ({
      entity_type: l.entity_type,
      entity_id: l.entity_id,
      action: l.action,
      before_value: l.before_value,
      after_value: l.after_value,
      performed_by_user_id: l.performed_by_user_id,
      reason: l.reason,
      at_created: l.at_created,
    }));
    merged.sort((a, b) => a.at_created.getTime() - b.at_created.getTime());
    return merged;
  }

  async submitTicketWeights(params: {
    ticketId: number;
    empty_weight: number;
    loaded_weight: number;
    userId: number;
    entrySource: WeighbridgeWeightEntrySource;
    entryNote?: string;
    reasonCode?: WeighbridgeManualReasonCode;
  }) {
    const ticketRow = await weighbridgeRepo.getTicketById(params.ticketId);
    if (!ticketRow) return { ok: false as const, reason: "ticket_not_found" };
    if (ticketRow.status !== "PENDING_EMPTY" && ticketRow.status !== "EMPTY_REGISTERED") {
      return { ok: false as const, reason: "invalid_ticket_state" };
    }
    if (params.empty_weight < 0 || params.loaded_weight < 0) {
      return { ok: false as const, reason: "invalid_negative_weight" };
    }
    if (params.loaded_weight <= params.empty_weight) {
      return { ok: false as const, reason: "invalid_weight_order" };
    }
    const net = params.loaded_weight - params.empty_weight;

    const missionRow = await missionsRepo.getMissionById(ticketRow.mission_id);
    if (!missionRow) return { ok: false as const, reason: "mission_missing" };
    const loadRow = await loadsRepo.getLoadById(missionRow.load_id);
    if (!loadRow) return { ok: false as const, reason: "load_missing" };

    const quantityTons = loadRow.quantity_tons ?? 0;
    const anomalyCheck = await isWeighbridgeAnomaly({
      empty_weight: params.empty_weight,
      loaded_weight: params.loaded_weight,
      quantity_tons: quantityTons,
      mineId: loadRow.mine_id,
    });
    const isManual = params.entrySource === "MANUAL";
    const nextStatus: WeighbridgeTicketStatus = isManual || anomalyCheck.anomaly ? "PENDING_HOLD" : "LOADED_REGISTERED";
    const requiresSupervisor = isManual;

    const updated = await weighbridgeRepo.updateTicket(params.ticketId, {
      empty_weight: params.empty_weight,
      loaded_weight: params.loaded_weight,
      net_weight: net,
      status: nextStatus,
      entry_source: isManual || params.entrySource === "AGENT" ? params.entrySource : null,
      entry_note: params.entryNote ?? null,
      reason_code: isManual && params.reasonCode ? params.reasonCode : null,
      requires_supervisor_approve: requiresSupervisor,
    });
    if (!updated) return { ok: false as const, reason: "update_failed" };

    if (isManual) {
      await this.audit.record({
        entity_type: "weighbridge_ticket",
        entity_id: String(params.ticketId),
        action: "weighbridge.manual_entry",
        before_value: { ticket_status: ticketRow.status },
        after_value: {
          ticket_id: params.ticketId,
          operator_id: params.userId,
          reason: params.reasonCode,
          entry_note: params.entryNote,
          ticket_status: nextStatus,
          empty_weight: params.empty_weight,
          loaded_weight: params.loaded_weight,
          net_weight: net,
          requires_supervisor_approve: true,
        },
        performed_by_user_id: params.userId,
        reason: params.reasonCode ?? "manual_entry",
      });
    } else {
      const isAgentEntry = params.entrySource === "AGENT";
      await this.audit.record({
        entity_type: "weighbridge_ticket",
        entity_id: String(params.ticketId),
        action: isAgentEntry ? "OVERRIDE" : anomalyCheck.anomaly ? "ANOMALY_HOLD" : "SUBMIT_WEIGHTS",
        before_value: { ticket_status: ticketRow.status },
        after_value: {
          ticket_status: nextStatus,
          empty_weight: params.empty_weight,
          loaded_weight: params.loaded_weight,
          net_weight: net,
          quantity_tons: quantityTons,
          deviation_ratio: anomalyCheck.deviationRatio,
          threshold: anomalyCheck.threshold,
          entry_source: params.entrySource,
          entry_note: params.entryNote,
        },
        performed_by_user_id: params.userId,
        reason: params.entrySource === "OPERATOR" ? "operator_panel" : "local_agent",
      });
    }

    await publishEvent(
      "weighbridge.weights_submitted",
      {
        ticket_id: params.ticketId,
        mission_id: ticketRow.mission_id,
        empty_weight: params.empty_weight,
        loaded_weight: params.loaded_weight,
        net_weight: net,
        anomaly: anomalyCheck.anomaly,
      },
      { published_by: params.userId },
    );

    if (anomalyCheck.anomaly) {
      await publishEvent(
        "weighbridge.anomaly",
        {
          ticket_id: params.ticketId,
          mission_id: ticketRow.mission_id,
          mine_id: loadRow.mine_id,
          quantity_tons: quantityTons,
          expected_kg: anomalyCheck.expectedKg,
          actual_kg: anomalyCheck.actualKg,
          deviation_ratio: anomalyCheck.deviationRatio,
          threshold: anomalyCheck.threshold,
          submitted_by_user_id: params.userId,
        },
        { published_by: params.userId },
      );
    }

    const mission = await missionsRepo.getMissionById(updated.mission_id);
    return {
      ok: true as const,
      ticket: mission ? toTicket(updated, mission.load_id) : toTicket(updated, 0),
      anomaly: anomalyCheck.anomaly,
    };
  }

  async listAdjustmentRequests(params?: { mineId?: number; status?: WeighbridgeAdjustmentRequest["status"] }) {
    const rows = await weighbridgeRepo.listAdjustmentRequests(params);
    return rows.map(toAdjustment);
  }

  async getTicketById(ticketId: number) {
    const row = await weighbridgeRepo.getTicketById(ticketId);
    if (!row) return null;
    const mission = await missionsRepo.getMissionById(row.mission_id);
    return mission ? toTicket(row, mission.load_id) : null;
  }

  async createAdjustmentRequest(params: {
    ticketId: number;
    reason: string;
    after_net: number;
    requestedByUserId: number;
  }) {
    const ticketRow = await weighbridgeRepo.getTicketById(params.ticketId);
    if (!ticketRow) return { ok: false as const, reason: "ticket_not_found" };
    const missionRow = await missionsRepo.getMissionById(ticketRow.mission_id);
    if (!missionRow) return { ok: false as const, reason: "mission_missing" };

    const beforeNet = ticketRow.net_weight;
    const adjRow = await weighbridgeRepo.createAdjustmentRequest({
      ticket_id: ticketRow.id,
      mission_id: missionRow.id,
      reason: params.reason,
      before_net: beforeNet,
      after_net: params.after_net,
      requested_by_user_id: params.requestedByUserId,
    });

    await this.audit.record({
      entity_type: "weighbridge_adjustment",
      entity_id: String(adjRow.id),
      action: "CREATED",
      after_value: adjRow,
      performed_by_user_id: params.requestedByUserId,
      reason: params.reason,
    });

    return { ok: true as const, adjustment: toAdjustment(adjRow) };
  }

  async approveAdjustment(params: { adjustmentId: number; approvedByUserId: number }) {
    const adjRow = await weighbridgeRepo.getAdjustmentById(params.adjustmentId);
    if (!adjRow || adjRow.status !== "PENDING") return { ok: false as const, reason: "invalid_adjustment" };

    const ticketRow = await weighbridgeRepo.getTicketById(adjRow.ticket_id);
    const missionRow = await missionsRepo.getMissionById(adjRow.mission_id);
    if (!ticketRow || !missionRow) return { ok: false as const, reason: "missing" };

    const loadRow = await loadsRepo.getLoadById(missionRow.load_id);
    if (!loadRow) return { ok: false as const, reason: "load_missing" };

    const owner = this.entities.findFleetOwnerById(missionRow.owner_id) as FleetOwner | null;
    const household = this.entities.findHouseholdById(loadRow.household_id) as Household | null;
    if (!owner || !household) return { ok: false as const, reason: "missing_entities" };

    let delta_total_fare = 0;
    if (missionRow.payment_state === "DISTRIBUTED") {
      const oldFare = await this.finance.computeFareTonnage(
        adjRow.before_net / 1000,
        loadRow.material_type,
        loadRow.mine_id,
        household.cooperative_id,
      );
      const newFare = await this.finance.computeFareTonnage(
        adjRow.after_net / 1000,
        loadRow.material_type,
        loadRow.mine_id,
        household.cooperative_id,
      );
      delta_total_fare = newFare.totalFare - oldFare.totalFare;
    }

    await prisma.$transaction(async (tx) => {
      await tx.weighbridge_adjustment_requests.update({
        where: { id: BigInt(params.adjustmentId) },
        data: {
          status: "APPROVED",
          approved_by_user_id: BigInt(params.approvedByUserId),
        },
      });
      await tx.weighbridge_tickets.update({
        where: { id: BigInt(adjRow.ticket_id) },
        data: { net_weight: adjRow.after_net, status: "ADJUSTED" },
      });

      const delta_verified_net_kg = adjRow.after_net - adjRow.before_net;
      if (delta_total_fare !== 0 || delta_verified_net_kg !== 0) {
        await ledgerRepo.applyFareDeltaInTx(tx, {
          mission_id: missionRow.id,
          mine_id: loadRow.mine_id,
          period_key: await periodKey(loadRow.mine_id, household.cooperative_id),
          delta_total_fare,
          delta_verified_net_kg,
          owner_id: owner.id,
          household_id: household.id,
          owner_active: owner.status === "APPROVED",
          household_active: household.status === "APPROVED",
          cooperative_id: household.cooperative_id,
        });
        if (delta_verified_net_kg !== 0) {
          await tx.missions.update({
            where: { id: BigInt(missionRow.id) },
            data: { verified_net_tons_kg: adjRow.after_net },
          });
        }
      }

      await auditRepo.insertAuditLog(
        {
          entity_type: "weighbridge_adjustment",
          entity_id: String(params.adjustmentId),
          action: "APPROVED",
          before_value: { before_net: adjRow.before_net },
          after_value: { after_net: adjRow.after_net, delta_total_fare },
          performed_by_user_id: params.approvedByUserId,
          reason: adjRow.reason,
        },
        tx,
      );
    });

    const adjustment = await weighbridgeRepo.getAdjustmentById(params.adjustmentId);
    const ticket = await weighbridgeRepo.getTicketById(adjRow.ticket_id);
    const mission = await this.getMission(adjRow.mission_id);

    await publishEvent(
      "weighbridge.adjustment_approved",
      {
        adjustment_id: params.adjustmentId,
        ticket_id: adjRow.ticket_id,
        mission_id: adjRow.mission_id,
        before_net: adjRow.before_net,
        after_net: adjRow.after_net,
        delta_total_fare,
      },
      { published_by: params.approvedByUserId },
    );

    return {
      ok: true as const,
      adjustment: adjustment ? toAdjustment(adjustment) : null,
      ticket: ticket && mission ? toTicket(ticket, mission.load_id) : null,
      mission: mission!,
      delta_total_fare,
    };
  }

  async rejectAdjustment(params: { adjustmentId: number; reason: string; rejectedByUserId: number }) {
    const adjRow = await weighbridgeRepo.getAdjustmentById(params.adjustmentId);
    if (!adjRow || adjRow.status !== "PENDING") return { ok: false as const, reason: "invalid_adjustment" };

    const updated = await weighbridgeRepo.updateAdjustment(params.adjustmentId, { status: "REJECTED" });
    if (!updated) return { ok: false as const, reason: "update_failed" };

    await this.audit.record({
      entity_type: "weighbridge_adjustment",
      entity_id: String(params.adjustmentId),
      action: "REJECTED",
      before_value: { status: "PENDING", before_net: adjRow.before_net, after_net: adjRow.after_net },
      after_value: { status: "REJECTED" },
      performed_by_user_id: params.rejectedByUserId,
      reason: params.reason,
    });

    return { ok: true as const, adjustment: toAdjustment(updated) };
  }
}
