import type { EntitiesStore, Household, FleetOwner } from "./entitiesStore";
import type { FinanceStore } from "./financeStore";
import type { AuditLogRecord, AuditLogStore } from "./auditLogStore";

export type LoadStatus = "PENDING" | "IN_TRANSIT" | "DELIVERED" | "CANCELED";

export type MissionPaymentState = "PENDING" | "CALCULATED" | "DISTRIBUTED" | "SETTLED" | "HELD" | "FAILED";
export type MissionStatus =
  | "ASSIGNED"
  | "LOADING"
  | "ON_THE_WAY"
  | "UNLOADING"
  | "COMPLETED"
  | "APPROVED"
  | "REJECTED"
  | "CANCELED";

export type WeighbridgeTicketStatus =
  | "PENDING_EMPTY"
  | "EMPTY_REGISTERED"
  | "LOADED_REGISTERED"
  | "APPROVED"
  | "REJECTED"
  | "ADJUSTED";

export type Load = {
  id: number;
  load_tracking_code: string;
  mine_id: number;
  household_id: number;
  owner_id: number; // fleet_owner.id
  material_type: string;
  quantity_tons: number;
  status: LoadStatus;
};

export type Mission = {
  id: number;
  load_id: number;
  mine_id: number;
  owner_id: number; // fleet_owner.id
  driver_id: number; // driver.id
  vehicle_id: number;
  status: MissionStatus;
  payment_state: MissionPaymentState;
  rate_per_ton_snapshot?: number;
  completedByDriverAt?: Date;
  created_at: Date;
  updated_at: Date;
};

export type WeighbridgeTicket = {
  id: number;
  mission_id: number;
  load_id: number;
  ticket_number: string;
  status: WeighbridgeTicketStatus;
  empty_weight?: number;
  loaded_weight?: number;
  net_weight?: number;
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
  /** Set when status is REJECTED (Q10 formal decline). */
  rejected_by_user_id?: number;
  created_at: Date;
};

export type WeighbridgeWeightEntrySource = "OPERATOR" | "AGENT" | "MANUAL";

export class MissionStore {
  private loads: Load[] = [];
  private missions: Mission[] = [];
  private tickets: WeighbridgeTicket[] = [];
  private adjustments: WeighbridgeAdjustmentRequest[] = [];

  private idSeq = 1;

  constructor(
    private entities: EntitiesStore,
    private finance: FinanceStore,
    private audit: AuditLogStore,
  ) {}

  listDriverMissions(driverId: number, mineId?: number) {
    const allowed: MissionStatus[] = ["ASSIGNED", "LOADING", "ON_THE_WAY", "UNLOADING", "COMPLETED"];
    return this.missions
      .filter((m) => m.driver_id === driverId && allowed.includes(m.status))
      .filter((m) => (mineId ? m.mine_id === mineId : true))
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  getMission(missionId: number) {
    return this.missions.find((m) => m.id === missionId) ?? null;
  }

  getTicketForMission(missionId: number) {
    return this.tickets.find((t) => t.mission_id === missionId) ?? null;
  }

  listTickets(params?: { status?: WeighbridgeTicketStatus; mineId?: number }) {
    const status = params?.status;
    const mineId = params?.mineId;
    return this.tickets
      .filter((t) => (status ? t.status === status : true))
      .filter((t) => {
        if (!mineId) return true;
        const m = this.getMission(t.mission_id);
        return m ? m.mine_id === mineId : false;
      })
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  getLoadById(loadId: number) {
    return this.loads.find((l) => l.id === loadId) ?? null;
  }

  createDemoLoadAndMission(params: {
    mine_id: number;
    household_id: number;
    owner_id: number;
    driver_id: number;
    vehicle_id: number;
    material_type: string;
    quantity_tons: number;
  }) {
    const loadId = this.idSeq++;
    const missionId = this.idSeq++;

    const load_tracking_code = `LOAD-${loadId}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;

    const load: Load = {
      id: loadId,
      load_tracking_code,
      mine_id: params.mine_id,
      household_id: params.household_id,
      owner_id: params.owner_id,
      material_type: params.material_type,
      quantity_tons: params.quantity_tons,
      status: "IN_TRANSIT",
    };

    const mission: Mission = {
      id: missionId,
      load_id: loadId,
      mine_id: params.mine_id,
      owner_id: params.owner_id,
      driver_id: params.driver_id,
      vehicle_id: params.vehicle_id,
      status: "ASSIGNED",
      payment_state: "PENDING",
      created_at: new Date(),
      updated_at: new Date(),
    };

    this.loads.push(load);
    this.missions.push(mission);

    return { load, mission };
  }

  driverUpdateStep(params: {
    missionId: number;
    driverId: number;
    step: "ASSIGNED" | "LOADING" | "ON_THE_WAY" | "UNLOADING" | "COMPLETED";
  }) {
    const mission = this.getMission(params.missionId);
    if (!mission) return { ok: false as const, reason: "mission_not_found" };
    if (mission.driver_id !== params.driverId) return { ok: false as const, reason: "forbidden" };

    const order: MissionStatus[] = ["ASSIGNED", "LOADING", "ON_THE_WAY", "UNLOADING", "COMPLETED"];
    const fromIdx = order.indexOf(mission.status as MissionStatus);
    const toIdx = order.indexOf(params.step as MissionStatus);

    if (fromIdx < 0 || toIdx < 0) return { ok: false as const, reason: "invalid_state" };
    if (toIdx !== fromIdx + 1) return { ok: false as const, reason: "invalid_transition" };

    mission.status = params.step;
    mission.updated_at = new Date();

    if (params.step === "COMPLETED") mission.completedByDriverAt = new Date();

    // When driver completes, create weighbridge ticket (pending) for operator.
    if (params.step === "COMPLETED") {
      const existing = this.getTicketForMission(mission.id);
      if (!existing) {
        this.tickets.push({
          id: this.idSeq++,
          mission_id: mission.id,
          load_id: mission.load_id,
          ticket_number: `WB-${mission.id}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`,
          status: "PENDING_EMPTY",
          empty_weight: 0,
          loaded_weight: 0,
          net_weight: 0,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    }

    return { ok: true as const, mission };
  }

  weighbridgeApprove(params: { ticketId: number; approvedByUserId: number }) {
    const ticket = this.tickets.find((t) => t.id === params.ticketId) ?? null;
    if (!ticket) return { ok: false as const, reason: "ticket_not_found" };
    if (ticket.status === "APPROVED") return { ok: false as const, reason: "already_approved" };
    if (ticket.status === "REJECTED") return { ok: false as const, reason: "ticket_rejected" };
    if (ticket.status !== "LOADED_REGISTERED") return { ok: false as const, reason: "weights_required" };

    const mission = this.getMission(ticket.mission_id);
    if (!mission) return { ok: false as const, reason: "mission_missing" };
    const load = this.getLoadById(mission.load_id);
    if (!load) return { ok: false as const, reason: "load_missing" };

    const owner = this.entities.findFleetOwnerById(mission.owner_id) as FleetOwner | null;
    const household = this.entities.findHouseholdById(load.household_id) as Household | null;
    if (!owner || !household) return { ok: false as const, reason: "missing_entities" };

    const prevTicketStatus = ticket.status;
    const prevMissionStatus = mission.status;

    const card = this.finance.getRateCard("HAULING_TONNAGE", load.material_type);
    if (card) mission.rate_per_ton_snapshot = card.rate;

    const qtyTons =
      ticket.net_weight !== undefined && ticket.net_weight !== null && Number(ticket.net_weight) > 0
        ? Number(ticket.net_weight)
        : load.quantity_tons;
    load.quantity_tons = qtyTons;

    ticket.status = "APPROVED";
    ticket.updated_at = new Date();
    mission.status = "APPROVED";
    mission.updated_at = new Date();

    const financeRes = this.finance.creditMissionShares({
      mission_id: mission.id,
      owner,
      household,
      material_type: load.material_type,
      quantity_tons: qtyTons,
    });
    mission.payment_state = "DISTRIBUTED";

    this.audit.record({
      entity_type: "weighbridge_ticket",
      entity_id: String(ticket.id),
      action: "APPROVED",
      before_value: { ticket_status: prevTicketStatus, mission_status: prevMissionStatus },
      after_value: {
        ticket_status: ticket.status,
        mission_status: mission.status,
        net_weight: ticket.net_weight,
        quantity_tons: qtyTons,
      },
      performed_by_user_id: params.approvedByUserId,
      reason: "weighbridge_approve",
    });

    return { ok: true as const, ticket, mission, finance: financeRes };
  }

  /** Q10: formal rejection before payout (invalid / disputed ticket). */
  weighbridgeRejectTicket(params: { ticketId: number; reason: string; rejectedByUserId: number }) {
    const ticket = this.tickets.find((t) => t.id === params.ticketId) ?? null;
    if (!ticket) return { ok: false as const, reason: "ticket_not_found" };
    if (ticket.status === "APPROVED" || ticket.status === "ADJUSTED") {
      return { ok: false as const, reason: "already_credited_use_adjustment" };
    }
    if (ticket.status === "REJECTED") return { ok: false as const, reason: "already_rejected" };

    const mission = this.getMission(ticket.mission_id);
    if (!mission) return { ok: false as const, reason: "mission_missing" };

    const prev = { ticket_status: ticket.status, mission_status: mission.status };
    ticket.status = "REJECTED";
    ticket.updated_at = new Date();
    mission.status = "REJECTED";
    mission.updated_at = new Date();

    this.audit.record({
      entity_type: "weighbridge_ticket",
      entity_id: String(ticket.id),
      action: "REJECTED",
      before_value: prev,
      after_value: { ticket_status: ticket.status, mission_status: mission.status },
      performed_by_user_id: params.rejectedByUserId,
      reason: params.reason,
    });

    return { ok: true as const, ticket, mission };
  }

  /** Audit trail for Q10 / مغایرت: ticket rows + adjustment rows for this ticket. */
  getWeighbridgeTicketAuditTrail(ticketId: number): AuditLogRecord[] {
    const ticketLogs = this.audit.listByEntity("weighbridge_ticket", String(ticketId));
    const adjLogs = this.adjustments
      .filter((a) => a.ticket_id === ticketId)
      .flatMap((a) => this.audit.listByEntity("weighbridge_adjustment", String(a.id)));
    const merged = [...ticketLogs, ...adjLogs];
    merged.sort((a, b) => a.at_created.getTime() - b.at_created.getTime());
    return merged;
  }

  submitTicketWeights(params: {
    ticketId: number;
    empty_weight: number;
    loaded_weight: number;
    userId: number;
    /** Q11: OPERATOR panel vs local agent vs manual correction path. */
    entrySource: WeighbridgeWeightEntrySource;
    /** Required when entrySource is AGENT or MANUAL (audit / dispute defense). */
    entryNote?: string;
  }) {
    const ticket = this.tickets.find((t) => t.id === params.ticketId) ?? null;
    if (!ticket) return { ok: false as const, reason: "ticket_not_found" };
    if (ticket.status !== "PENDING_EMPTY" && ticket.status !== "EMPTY_REGISTERED") {
      return { ok: false as const, reason: "invalid_ticket_state" };
    }
    const net = params.loaded_weight - params.empty_weight;
    ticket.empty_weight = params.empty_weight;
    ticket.loaded_weight = params.loaded_weight;
    ticket.net_weight = net;
    ticket.status = "LOADED_REGISTERED";
    ticket.updated_at = new Date();

    this.audit.record({
      entity_type: "weighbridge_ticket",
      entity_id: String(ticket.id),
      action: "SUBMIT_WEIGHTS",
      after_value: {
        empty_weight: params.empty_weight,
        loaded_weight: params.loaded_weight,
        net_weight: net,
        entry_source: params.entrySource,
        entry_note: params.entryNote,
      },
      performed_by_user_id: params.userId,
      reason:
        params.entrySource === "OPERATOR"
          ? "operator_panel"
          : params.entrySource === "AGENT"
            ? "local_agent"
            : "manual_entry",
    });

    return { ok: true as const, ticket };
  }

  listAdjustmentRequests(params?: { mineId?: number; status?: WeighbridgeAdjustmentRequest["status"] }) {
    const mineId = params?.mineId;
    const status = params?.status;
    return this.adjustments
      .filter((a) => (status ? a.status === status : true))
      .filter((a) => {
        if (!mineId) return true;
        const m = this.getMission(a.mission_id);
        return m ? m.mine_id === mineId : false;
      })
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  getTicketById(ticketId: number) {
    return this.tickets.find((t) => t.id === ticketId) ?? null;
  }

  createAdjustmentRequest(params: {
    ticketId: number;
    reason: string;
    after_net: number;
    requestedByUserId: number;
  }) {
    const ticket = this.tickets.find((t) => t.id === params.ticketId) ?? null;
    if (!ticket) return { ok: false as const, reason: "ticket_not_found" };
    const mission = this.getMission(ticket.mission_id);
    if (!mission) return { ok: false as const, reason: "mission_missing" };

    const beforeNet = Number(ticket.net_weight ?? 0);
    const adj: WeighbridgeAdjustmentRequest = {
      id: this.idSeq++,
      ticket_id: ticket.id,
      mission_id: mission.id,
      reason: params.reason,
      before_net: beforeNet,
      after_net: params.after_net,
      status: "PENDING",
      requested_by_user_id: params.requestedByUserId,
      created_at: new Date(),
    };
    this.adjustments.push(adj);
    this.audit.record({
      entity_type: "weighbridge_adjustment",
      entity_id: String(adj.id),
      action: "CREATED",
      after_value: adj,
      performed_by_user_id: params.requestedByUserId,
      reason: params.reason,
    });
    return { ok: true as const, adjustment: adj };
  }

  approveAdjustment(params: { adjustmentId: number; approvedByUserId: number }) {
    const adj = this.adjustments.find((a) => a.id === params.adjustmentId) ?? null;
    if (!adj || adj.status !== "PENDING") return { ok: false as const, reason: "invalid_adjustment" };
    const ticket = this.tickets.find((t) => t.id === adj.ticket_id) ?? null;
    const mission = this.getMission(adj.mission_id);
    if (!ticket || !mission) return { ok: false as const, reason: "missing" };
    const load = this.getLoadById(mission.load_id);
    if (!load) return { ok: false as const, reason: "load_missing" };

    const owner = this.entities.findFleetOwnerById(mission.owner_id) as FleetOwner | null;
    const household = this.entities.findHouseholdById(load.household_id) as Household | null;
    if (!owner || !household) return { ok: false as const, reason: "missing_entities" };

    load.quantity_tons = adj.after_net;
    ticket.net_weight = adj.after_net;
    ticket.status = "ADJUSTED";
    ticket.updated_at = new Date();

    let delta_total_fare = 0;
    if (mission.payment_state === "DISTRIBUTED") {
      const oldFare = this.finance.computeFareTonnage(adj.before_net, load.material_type);
      const newFare = this.finance.computeFareTonnage(adj.after_net, load.material_type);
      delta_total_fare = newFare - oldFare;
      this.finance.applyTonnageFareDelta({
        mission_id: mission.id,
        owner,
        household,
        delta_total_fare,
      });
    }

    adj.status = "APPROVED";
    adj.approved_by_user_id = params.approvedByUserId;
    this.audit.record({
      entity_type: "weighbridge_adjustment",
      entity_id: String(adj.id),
      action: "APPROVED",
      before_value: { before_net: adj.before_net },
      after_value: { after_net: adj.after_net, delta_total_fare },
      performed_by_user_id: params.approvedByUserId,
      reason: adj.reason,
    });

    return { ok: true as const, adjustment: adj, ticket, mission, delta_total_fare };
  }

  rejectAdjustment(params: { adjustmentId: number; reason: string; rejectedByUserId: number }) {
    const adj = this.adjustments.find((a) => a.id === params.adjustmentId) ?? null;
    if (!adj || adj.status !== "PENDING") return { ok: false as const, reason: "invalid_adjustment" };

    adj.status = "REJECTED";
    adj.rejected_by_user_id = params.rejectedByUserId;

    this.audit.record({
      entity_type: "weighbridge_adjustment",
      entity_id: String(adj.id),
      action: "REJECTED",
      before_value: { status: "PENDING", before_net: adj.before_net, after_net: adj.after_net },
      after_value: { status: "REJECTED" },
      performed_by_user_id: params.rejectedByUserId,
      reason: params.reason,
    });

    return { ok: true as const, adjustment: adj };
  }
}

