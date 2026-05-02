import type { UserRole } from "../types/userRole";

export type ApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "SUSPENDED"
  | "NEEDS_CORRECTION";

export type Household = {
  id: number;
  user_id: number;
  village_id: number;
  head_name: string;
  national_id: string;
  bank_iban?: string;
  status: ApprovalStatus;
};

export type FleetOwner = {
  id: number;
  user_id: number;
  full_name: string;
  national_id: string;
  bank_iban?: string;
  status: ApprovalStatus;
};

export type Driver = {
  id: number;
  user_id: number;
  full_name: string;
  license_number?: string;
  status: ApprovalStatus;
};

export type Vehicle = {
  id: number;
  owner_id: number;
  license_plate: string;
  vehicle_type: string;
  capacity_tons: number;
  status: ApprovalStatus;
};

/**
 * DEV/MVP in-memory entities store.
 * KYC flows and coop approvals will be implemented later or backed by Postgres.
 */
export class EntitiesStore {
  private households: Household[] = [];
  private fleetOwners: FleetOwner[] = [];
  private drivers: Driver[] = [];
  private vehicles: Vehicle[] = [];

  private idSeq = 1;

  nextId() {
    return this.idSeq++;
  }

  upsertHousehold(params: Omit<Household, "id">) {
    const existing = this.households.find((h) => h.user_id === params.user_id);
    if (existing) {
      Object.assign(existing, params);
      return existing;
    }
    const h: Household = { id: this.nextId(), ...params };
    this.households.push(h);
    return h;
  }

  upsertFleetOwner(params: Omit<FleetOwner, "id">) {
    const existing = this.fleetOwners.find((o) => o.user_id === params.user_id);
    if (existing) {
      Object.assign(existing, params);
      return existing;
    }
    const o: FleetOwner = { id: this.nextId(), ...params };
    this.fleetOwners.push(o);
    return o;
  }

  upsertDriver(params: Omit<Driver, "id">) {
    const existing = this.drivers.find((d) => d.user_id === params.user_id);
    if (existing) {
      Object.assign(existing, params);
      return existing;
    }
    const d: Driver = { id: this.nextId(), ...params };
    this.drivers.push(d);
    return d;
  }

  upsertVehicle(params: Omit<Vehicle, "id">) {
    const existing = this.vehicles.find((v) => v.license_plate === params.license_plate);
    if (existing) {
      Object.assign(existing, params);
      return existing;
    }
    const v: Vehicle = { id: this.nextId(), ...params };
    this.vehicles.push(v);
    return v;
  }

  findHouseholdByUserId(userId: number) {
    return this.households.find((h) => h.user_id === userId) ?? null;
  }

  findHouseholdById(householdId: number) {
    return this.households.find((h) => h.id === householdId) ?? null;
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
    return this.vehicles.find((v) => v.id === vehicleId) ?? null;
  }

  approveRole(entity: { type: UserRole; id: number }) {
    const status: ApprovalStatus = "APPROVED";
    switch (entity.type) {
      case "HOUSEHOLD": {
        const h = this.households.find((x) => x.id === entity.id);
        if (h) h.status = status;
        return h;
      }
      case "FLEET_OWNER": {
        const o = this.fleetOwners.find((x) => x.id === entity.id);
        if (o) o.status = status;
        return o;
      }
      case "DRIVER": {
        const d = this.drivers.find((x) => x.id === entity.id);
        if (d) d.status = status;
        return d;
      }
      default:
        return null;
    }
  }
}

