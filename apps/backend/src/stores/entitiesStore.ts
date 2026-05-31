import type { UserRole } from "../types/userRole";
import type { ApprovalStatus, HouseholdStatus } from "@prisma/client";
import * as householdsRepo from "../repositories/householdsRepository";
import * as fleetOwnersRepo from "../repositories/fleetOwnersRepository";
import * as driversRepo from "../repositories/driversRepository";
import * as vehiclesRepo from "../repositories/vehiclesRepository";
import * as objectionsRepo from "../repositories/objectionsRepository";

export type { ApprovalStatus };

export type Household = {
  id: number;
  user_id: number;
  village_id: number;
  cooperative_id?: number;
  head_name: string;
  national_id: string;
  bank_iban?: string;
  status: ApprovalStatus;
};

export type FleetOwner = {
  id: number;
  user_id: number;
  cooperative_id?: number;
  full_name: string;
  national_id: string;
  bank_iban?: string;
  status: ApprovalStatus;
  ownership_doc_url?: string;
  insurance_doc_url?: string;
};

export type Driver = {
  id: number;
  user_id: number;
  cooperative_id?: number;
  full_name: string;
  license_number?: string;
  license_file_url?: string;
  identity_file_url?: string;
  status: ApprovalStatus;
};

export type Vehicle = {
  id: number;
  owner_id: number;
  cooperative_id?: number;
  license_plate: string;
  vehicle_type: string;
  capacity_tons: number;
  status: ApprovalStatus;
  ownership_doc_url?: string;
  insurance_doc_url?: string;
};

export type MembershipObjection = {
  id: number;
  cooperative_id: number;
  household_id: number;
  reporter_user_id: number;
  reason: string;
  status: "PENDING" | "RESOLVED";
  resolved_by?: number;
  resolution_reason?: string;
  created_at: Date;
};

function mapObjectionRow(row: objectionsRepo.ObjectionRow): MembershipObjection {
  return {
    id: row.id,
    cooperative_id: row.cooperative_id,
    household_id: row.target_household_id,
    reporter_user_id: row.reporter_user_id,
    reason: row.reason,
    status: row.status,
    resolved_by: row.resolved_by,
    resolution_reason: row.resolution_reason,
    created_at: row.created_at,
  };
}

function householdStatusToApproval(s: HouseholdStatus): ApprovalStatus {
  return s as ApprovalStatus;
}

function approvalToHouseholdStatus(s: ApprovalStatus): HouseholdStatus {
  return s as HouseholdStatus;
}

export class EntitiesStore {
  private households: Household[] = [];
  private fleetOwners: FleetOwner[] = [];
  private drivers: Driver[] = [];
  private vehicles: Vehicle[] = [];

  private idSeq = 1;

  async hydrate() {
    const [hh, fo, dr, ve] = await Promise.all([
      householdsRepo.listHouseholds(),
      fleetOwnersRepo.listFleetOwners(),
      driversRepo.listDrivers(),
      vehiclesRepo.listVehicles(),
    ]);
    this.households = hh.map((h) => ({
      ...h,
      status: householdStatusToApproval(h.status),
    }));
    this.fleetOwners = fo.map((o) => ({ ...o }));
    this.drivers = dr.map((d) => ({ ...d }));
    this.vehicles = ve.map((v) => ({ ...v }));
    const maxId = Math.max(
      0,
      ...this.households.map((x) => x.id),
      ...this.fleetOwners.map((x) => x.id),
      ...this.drivers.map((x) => x.id),
      ...this.vehicles.map((x) => x.id),
    );
    this.idSeq = maxId + 1;
  }

  nextId() {
    return this.idSeq++;
  }

  async upsertHousehold(params: Omit<Household, "id">) {
    const row = await householdsRepo.upsertHousehold({
      user_id: params.user_id,
      village_id: params.village_id,
      cooperative_id: params.cooperative_id,
      head_name: params.head_name,
      national_id: params.national_id,
      bank_iban: params.bank_iban,
      status: approvalToHouseholdStatus(params.status),
    });
    const h: Household = { ...row, status: params.status };
    const idx = this.households.findIndex((x) => x.user_id === params.user_id);
    if (idx >= 0) this.households[idx] = h;
    else this.households.push(h);
    return h;
  }

  async updateHouseholdInCache(h: Household) {
    const idx = this.households.findIndex((x) => x.id === h.id);
    if (idx >= 0) this.households[idx] = h;
    else this.households.push(h);
    return h;
  }

  async upsertFleetOwner(params: Omit<FleetOwner, "id">) {
    const row = await fleetOwnersRepo.upsertFleetOwner({
      user_id: params.user_id,
      cooperative_id: params.cooperative_id,
      full_name: params.full_name,
      national_id: params.national_id,
      bank_iban: params.bank_iban,
      status: params.status,
      ownership_doc_url: params.ownership_doc_url,
      insurance_doc_url: params.insurance_doc_url,
    });
    const o: FleetOwner = { ...row };
    const idx = this.fleetOwners.findIndex((x) => x.user_id === params.user_id);
    if (idx >= 0) this.fleetOwners[idx] = o;
    else this.fleetOwners.push(o);
    return o;
  }

  async updateFleetOwnerInCache(o: FleetOwner) {
    const idx = this.fleetOwners.findIndex((x) => x.id === o.id);
    if (idx >= 0) this.fleetOwners[idx] = o;
    else this.fleetOwners.push(o);
    return o;
  }

  async upsertDriver(params: Omit<Driver, "id">) {
    const row = await driversRepo.upsertDriver({
      user_id: params.user_id,
      cooperative_id: params.cooperative_id,
      full_name: params.full_name,
      license_number: params.license_number,
      license_file_url: params.license_file_url,
      identity_file_url: params.identity_file_url,
      status: params.status,
    });
    const d: Driver = { ...row };
    const idx = this.drivers.findIndex((x) => x.user_id === params.user_id);
    if (idx >= 0) this.drivers[idx] = d;
    else this.drivers.push(d);
    return d;
  }

  async updateDriverInCache(d: Driver) {
    const idx = this.drivers.findIndex((x) => x.id === d.id);
    if (idx >= 0) this.drivers[idx] = d;
    else this.drivers.push(d);
    return d;
  }

  async upsertVehicle(params: Omit<Vehicle, "id">) {
    const row = await vehiclesRepo.upsertVehicle({
      owner_id: params.owner_id,
      cooperative_id: params.cooperative_id,
      license_plate: params.license_plate,
      vehicle_type: params.vehicle_type,
      capacity_tons: params.capacity_tons,
      status: params.status,
      ownership_doc_url: params.ownership_doc_url,
      insurance_doc_url: params.insurance_doc_url,
    });
    const v: Vehicle = { ...row };
    const idx = this.vehicles.findIndex((x) => x.license_plate === params.license_plate);
    if (idx >= 0) this.vehicles[idx] = v;
    else this.vehicles.push(v);
    return v;
  }

  async updateVehicleInCache(v: Vehicle) {
    const idx = this.vehicles.findIndex((x) => x.id === v.id);
    if (idx >= 0) this.vehicles[idx] = v;
    else this.vehicles.push(v);
    return v;
  }

  findHouseholdByUserId(userId: number) {
    return this.households.find((h) => h.user_id === userId) ?? null;
  }

  findHouseholdById(householdId: number) {
    return this.households.find((h) => h.id === householdId) ?? null;
  }

  listHouseholds() {
    return this.households.slice();
  }

  listHouseholdsByCooperative(cooperativeId: number) {
    return this.households.filter((h) => h.cooperative_id === cooperativeId);
  }

  listApprovedHouseholds() {
    return this.households.filter((h) => h.status === "APPROVED");
  }

  findFleetOwnerByUserId(userId: number) {
    return this.fleetOwners.find((o) => o.user_id === userId) ?? null;
  }

  findFleetOwnerById(fleetOwnerId: number) {
    return this.fleetOwners.find((o) => o.id === fleetOwnerId) ?? null;
  }

  findDriverByUserId(userId: number) {
    return this.drivers.find((d) => d.user_id === userId) ?? null;
  }

  findDriverById(driverId: number) {
    return this.drivers.find((d) => d.id === driverId) ?? null;
  }

  listApprovedDrivers() {
    return this.drivers.filter((d) => d.status === "APPROVED");
  }

  listApprovedVehiclesByOwner(ownerId: number) {
    return this.vehicles.filter((v) => v.owner_id === ownerId && v.status === "APPROVED");
  }

  findVehicleById(vehicleId: number) {
    return this.vehicles.find((v) => v.id === vehicleId) ?? null;
  }

  getVehicle(vehicleId: number) {
    return this.findVehicleById(vehicleId);
  }

  async approveRole(entity: { type: UserRole; id: number }) {
    const status: ApprovalStatus = "APPROVED";
    switch (entity.type) {
      case "HOUSEHOLD": {
        const updated = await householdsRepo.updateHouseholdStatus(entity.id, "APPROVED");
        const h = this.households.find((x) => x.id === entity.id);
        if (h && updated) {
          h.status = status;
          return h;
        }
        return null;
      }
      case "FLEET_OWNER": {
        const updated = await fleetOwnersRepo.updateFleetOwnerStatus(entity.id, "APPROVED");
        const o = this.fleetOwners.find((x) => x.id === entity.id);
        if (o && updated) {
          o.status = status;
          return o;
        }
        return null;
      }
      case "DRIVER": {
        const updated = await driversRepo.updateDriverStatus(entity.id, "APPROVED");
        const d = this.drivers.find((x) => x.id === entity.id);
        if (d && updated) {
          d.status = status;
          return d;
        }
        return null;
      }
      default:
        return null;
    }
  }

  async createObjection(params: {
    cooperative_id: number;
    household_id: number;
    reporter_user_id: number;
    reason: string;
  }) {
    if (!Number.isInteger(params.reporter_user_id) || params.reporter_user_id <= 0) {
      return null;
    }
    const h = this.findHouseholdById(params.household_id);
    if (!h || h.cooperative_id !== params.cooperative_id) return null;
    const row = await objectionsRepo.createObjection({
      cooperative_id: params.cooperative_id,
      target_household_id: params.household_id,
      reporter_user_id: params.reporter_user_id,
      reason: params.reason,
    });
    return mapObjectionRow(row);
  }

  async listObjections(params?: { cooperative_id?: number }) {
    const rows = await objectionsRepo.listObjections(params);
    return rows.map(mapObjectionRow);
  }

  async findObjectionById(id: number) {
    const row = await objectionsRepo.findObjectionById(id);
    return row ? mapObjectionRow(row) : null;
  }

  async resolveObjection(params: { objection_id: number; resolved_by: number; resolution_reason: string }) {
    const row = await objectionsRepo.resolveObjection(params);
    return row ? mapObjectionRow(row) : null;
  }
}
