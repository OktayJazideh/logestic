import type { EntitiesStore, FleetOwner, Household } from "./entitiesStore";
import type { FinanceStore } from "./financeStore";

export type HourlyWorkLogStatus = "PENDING" | "APPROVED" | "REJECTED";

export type HourlyWorkLog = {
  id: number;
  mine_id: number;
  fleet_owner_id: number;
  household_id: number;
  vehicle_id?: number;
  hours: number;
  hourly_rate_snapshot: number;
  status: HourlyWorkLogStatus;
  consultant_user_id?: number;
  approved_at?: Date;
  created_at: Date;
};

export class HourlyWorkLogStore {
  private logs: HourlyWorkLog[] = [];
  private idSeq = 1;

  constructor(
    private entities: EntitiesStore,
    private finance: FinanceStore,
  ) {}

  create(params: {
    mine_id: number;
    fleet_owner_id: number;
    household_id: number;
    vehicle_id?: number;
    hours: number;
    hourly_rate_per_hour: number;
  }) {
    const log: HourlyWorkLog = {
      id: this.idSeq++,
      mine_id: params.mine_id,
      fleet_owner_id: params.fleet_owner_id,
      household_id: params.household_id,
      vehicle_id: params.vehicle_id,
      hours: params.hours,
      hourly_rate_snapshot: params.hourly_rate_per_hour,
      status: "PENDING",
      created_at: new Date(),
    };
    this.logs.push(log);
    return log;
  }

  approve(params: { logId: number; consultantUserId: number }) {
    const log = this.logs.find((l) => l.id === params.logId) ?? null;
    if (!log || log.status !== "PENDING") return { ok: false as const, reason: "invalid_log" };

    const owner = this.entities.findFleetOwnerById(log.fleet_owner_id) as FleetOwner | null;
    const household = this.entities.findHouseholdById(log.household_id) as Household | null;
    if (!owner || !household) return { ok: false as const, reason: "missing_entities" };

    log.status = "APPROVED";
    log.consultant_user_id = params.consultantUserId;
    log.approved_at = new Date();

    const finance = this.finance.creditHourlyShares({
      hourly_log_id: log.id,
      owner,
      household,
      hours: log.hours,
      hourly_rate: log.hourly_rate_snapshot,
    });

    return { ok: true as const, log, finance };
  }

  listForMine(mineId?: number) {
    return this.logs
      .filter((l) => (mineId ? l.mine_id === mineId : true))
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }
}
