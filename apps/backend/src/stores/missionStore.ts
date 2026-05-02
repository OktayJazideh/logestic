import type { EntitiesStore, Household, FleetOwner } from "./entitiesStore";
import type { FinanceStore } from "./financeStore";

export type LoadStatus = "PENDING" | "IN_TRANSIT" | "DELIVERED" | "CANCELED";
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
  net_weight?: number;
  created_at: Date;
  updated_at: Date;
};

export class MissionStore {
  private loads: Load[] = [];
  private missions: Mission[] = [];
  private tickets: WeighbridgeTicket[] = [];

  private idSeq = 1;

  constructor(
    private entities: EntitiesStore,
    private finance: FinanceStore,
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
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    }

    return { ok: true as const, mission };
  }

  weighbridgeApprove(params: { ticketId: number }) {
    const ticket = this.tickets.find((t) => t.id === params.ticketId) ?? null;
    if (!ticket) return { ok: false as const, reason: "ticket_not_found" };
    if (ticket.status === "APPROVED") return { ok: false as const, reason: "already_approved" };

    const mission = this.getMission(ticket.mission_id);
    if (!mission) return { ok: false as const, reason: "mission_missing" };
    const load = this.getLoadById(mission.load_id);
    if (!load) return { ok: false as const, reason: "load_missing" };

    const owner = this.entities.findFleetOwnerById(mission.owner_id) as FleetOwner | null;
    const household = this.entities.findHouseholdById(load.household_id) as Household | null;
    if (!owner || !household) return { ok: false as const, reason: "missing_entities" };

    // finalize
    ticket.status = "APPROVED";
    ticket.updated_at = new Date();
    mission.status = "APPROVED";
    mission.updated_at = new Date();

    const financeRes = this.finance.creditMissionShares({
      mission_id: mission.id,
      owner,
      household,
      material_type: load.material_type,
      quantity_tons: load.quantity_tons,
    });

    return { ok: true as const, ticket, mission, finance: financeRes };
  }
}

