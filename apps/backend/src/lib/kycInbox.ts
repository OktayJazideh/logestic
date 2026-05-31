/**
 * Shared KYC inbox loader (coop KYC route + role inbox aggregate).
 */
import * as auditRepo from "../repositories/auditLogsRepository";
import * as householdsRepo from "../repositories/householdsRepository";
import * as driversRepo from "../repositories/driversRepository";
import * as fleetOwnersRepo from "../repositories/fleetOwnersRepository";
import * as vehiclesRepo from "../repositories/vehiclesRepository";
import { prisma } from "../db/prisma";
import { toBig, toNum } from "../repositories/id";
import type { KycEntityKind } from "./kycWorkflow";

export type KycInboxStatus = "PENDING" | "NEEDS_CORRECTION";

export type KycInboxEntityKind = "household" | "driver" | "fleet_owner" | "vehicle";

const kindLabelFa: Record<KycInboxEntityKind, string> = {
  household: "خانوار",
  driver: "راننده",
  fleet_owner: "مالک ناوگان",
  vehicle: "خودرو",
};

async function attachCorrectionReasons<T extends { id: number }>(
  entityType: KycEntityKind,
  rows: T[],
): Promise<Array<T & { correction_reason?: string }>> {
  const reasons = await auditRepo.latestKycCorrectionReasons(
    entityType,
    rows.map((r) => String(r.id)),
  );
  return rows.map((r) => ({
    ...r,
    correction_reason: reasons.get(String(r.id)),
  }));
}

export async function loadKycInbox(coopId: number, status: KycInboxStatus = "PENDING") {
  const [households, drivers, fleet_owners, vehicles] = await Promise.all([
    householdsRepo.listHouseholdsByCooperativeAndStatus(coopId, status),
    driversRepo.listDriversByCooperativeAndStatus(coopId, status),
    fleetOwnersRepo.listFleetOwnersByCooperativeAndStatus(coopId, status),
    vehiclesRepo.listVehiclesByCooperativeAndStatus(coopId, status),
  ]);

  const hhBase = households.map((h) => ({
    id: h.id,
    kind: "household" as const,
    label: h.head_name,
    cooperative_id: h.cooperative_id,
    status: h.status,
    national_id: h.national_id,
  }));
  const drBase = drivers.map((d) => ({
    id: d.id,
    kind: "driver" as const,
    label: d.full_name,
    cooperative_id: d.cooperative_id,
    status: d.status,
    license_number: d.license_number,
    license_file_url: d.license_file_url,
    identity_file_url: d.identity_file_url,
  }));
  const foBase = fleet_owners.map((o) => ({
    id: o.id,
    kind: "fleet_owner" as const,
    label: o.full_name,
    cooperative_id: o.cooperative_id,
    status: o.status,
    national_id: o.national_id,
    ownership_doc_url: o.ownership_doc_url,
    insurance_doc_url: o.insurance_doc_url,
  }));
  const veBase = vehicles.map((v) => ({
    id: v.id,
    kind: "vehicle" as const,
    label: v.license_plate,
    cooperative_id: v.cooperative_id,
    status: v.status,
    license_plate: v.license_plate,
    ownership_doc_url: v.ownership_doc_url,
    insurance_doc_url: v.insurance_doc_url,
  }));

  if (status !== "NEEDS_CORRECTION") {
    return { households: hhBase, drivers: drBase, fleet_owners: foBase, vehicles: veBase };
  }

  const [householdsOut, driversOut, fleetOwnersOut, vehiclesOut] = await Promise.all([
    attachCorrectionReasons("household", hhBase),
    attachCorrectionReasons("driver", drBase),
    attachCorrectionReasons("fleet_owner", foBase),
    attachCorrectionReasons("vehicle", veBase),
  ]);
  return {
    households: householdsOut,
    drivers: driversOut,
    fleet_owners: fleetOwnersOut,
    vehicles: vehiclesOut,
  };
}

export type KycPendingInboxRow = {
  entity_kind: KycInboxEntityKind;
  id: number;
  cooperative_id: number;
  label: string;
  status: string;
  waiting_since: string;
};

/** Flat pending KYC rows for role inbox (includes created_at). */
export async function listPendingKycInboxRows(cooperativeIds: number[]): Promise<KycPendingInboxRow[]> {
  if (cooperativeIds.length === 0) return [];
  const coopFilter = { cooperative_id: { in: cooperativeIds.map(toBig) }, status: "PENDING" as const };

  const [households, drivers, fleetOwners, vehicles] = await Promise.all([
    prisma.households.findMany({
      where: coopFilter,
      select: { id: true, cooperative_id: true, head_name: true, status: true, created_at: true },
      orderBy: { created_at: "asc" },
    }),
    prisma.drivers.findMany({
      where: coopFilter,
      select: { id: true, cooperative_id: true, full_name: true, status: true, created_at: true },
      orderBy: { created_at: "asc" },
    }),
    prisma.fleet_owners.findMany({
      where: coopFilter,
      select: { id: true, cooperative_id: true, full_name: true, status: true, created_at: true },
      orderBy: { created_at: "asc" },
    }),
    prisma.vehicles.findMany({
      where: coopFilter,
      select: { id: true, cooperative_id: true, license_plate: true, status: true, created_at: true },
      orderBy: { created_at: "asc" },
    }),
  ]);

  const rows: KycPendingInboxRow[] = [];
  for (const h of households) {
    rows.push({
      entity_kind: "household",
      id: toNum(h.id),
      cooperative_id: toNum(h.cooperative_id!),
      label: h.head_name,
      status: h.status,
      waiting_since: h.created_at.toISOString(),
    });
  }
  for (const d of drivers) {
    rows.push({
      entity_kind: "driver",
      id: toNum(d.id),
      cooperative_id: toNum(d.cooperative_id!),
      label: d.full_name,
      status: d.status,
      waiting_since: d.created_at.toISOString(),
    });
  }
  for (const o of fleetOwners) {
    rows.push({
      entity_kind: "fleet_owner",
      id: toNum(o.id),
      cooperative_id: toNum(o.cooperative_id!),
      label: o.full_name,
      status: o.status,
      waiting_since: o.created_at.toISOString(),
    });
  }
  for (const v of vehicles) {
    rows.push({
      entity_kind: "vehicle",
      id: toNum(v.id),
      cooperative_id: toNum(v.cooperative_id!),
      label: v.license_plate,
      status: v.status,
      waiting_since: v.created_at.toISOString(),
    });
  }
  return rows;
}

export function kycInboxTitle(row: KycPendingInboxRow): string {
  return `KYC ${kindLabelFa[row.entity_kind]}: ${row.label}`;
}

export type KycInboxSortField = "created_at" | "name" | "status";

export type KycInboxTableItem = {
  id: number;
  entity_type: KycInboxEntityKind;
  name: string;
  national_id: string | null;
  village_id: number | null;
  village_name: string | null;
  status: string;
  created_at: string;
  cooperative_id: number;
  correction_reason?: string;
  charter_file_url?: string | null;
  license_file_url?: string | null;
  identity_file_url?: string | null;
  ownership_doc_url?: string | null;
  insurance_doc_url?: string | null;
};

export type KycInboxQueryParams = {
  coopId: number;
  status: KycInboxStatus;
  villageId?: number;
  entityType?: KycInboxEntityKind;
  fromDate?: Date;
  toDate?: Date;
  page: number;
  limit: number;
  sortField: KycInboxSortField;
  sortDir: "asc" | "desc";
};

export type KycInboxQueryResult = {
  items: KycInboxTableItem[];
  total: number;
  page: number;
  limit: number;
};

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

function createdAtFilter(fromDate?: Date, toDate?: Date) {
  if (!fromDate && !toDate) return undefined;
  const created_at: { gte?: Date; lte?: Date } = {};
  if (fromDate) created_at.gte = fromDate;
  if (toDate) created_at.lte = endOfDay(toDate);
  return created_at;
}

function compareRows(a: KycInboxTableItem, b: KycInboxTableItem, field: KycInboxSortField, dir: "asc" | "desc"): number {
  let cmp = 0;
  if (field === "created_at") {
    cmp = a.created_at.localeCompare(b.created_at);
  } else if (field === "name") {
    cmp = a.name.localeCompare(b.name, "fa");
  } else {
    cmp = a.status.localeCompare(b.status);
  }
  return dir === "asc" ? cmp : -cmp;
}

async function fetchHouseholdInboxRows(
  coopId: number,
  status: KycInboxStatus,
  villageId?: number,
  fromDate?: Date,
  toDate?: Date,
): Promise<KycInboxTableItem[]> {
  const rows = await prisma.households.findMany({
    where: {
      cooperative_id: toBig(coopId),
      status,
      deleted_at: null,
      ...(villageId != null ? { village_id: toBig(villageId) } : {}),
      ...(createdAtFilter(fromDate, toDate) ? { created_at: createdAtFilter(fromDate, toDate) } : {}),
    },
    include: { village: { select: { id: true, name: true } } },
  });
  return rows.map((h) => ({
    id: toNum(h.id),
    entity_type: "household" as const,
    name: h.head_name,
    national_id: h.national_id,
    village_id: toNum(h.village_id),
    village_name: h.village.name,
    status: h.status,
    created_at: h.created_at.toISOString(),
    cooperative_id: coopId,
  }));
}

async function fetchDriverInboxRows(
  coopId: number,
  status: KycInboxStatus,
  fromDate?: Date,
  toDate?: Date,
): Promise<KycInboxTableItem[]> {
  const rows = await prisma.drivers.findMany({
    where: {
      cooperative_id: toBig(coopId),
      status,
      deleted_at: null,
      ...(createdAtFilter(fromDate, toDate) ? { created_at: createdAtFilter(fromDate, toDate) } : {}),
    },
  });
  return rows.map((d) => ({
    id: toNum(d.id),
    entity_type: "driver" as const,
    name: d.full_name,
    national_id: d.license_number,
    village_id: null,
    village_name: null,
    status: d.status,
    created_at: d.created_at.toISOString(),
    cooperative_id: coopId,
    license_file_url: d.license_file_url,
    identity_file_url: d.identity_file_url,
    charter_file_url: d.identity_file_url,
  }));
}

async function fetchFleetOwnerInboxRows(
  coopId: number,
  status: KycInboxStatus,
  fromDate?: Date,
  toDate?: Date,
): Promise<KycInboxTableItem[]> {
  const rows = await prisma.fleet_owners.findMany({
    where: {
      cooperative_id: toBig(coopId),
      status,
      deleted_at: null,
      ...(createdAtFilter(fromDate, toDate) ? { created_at: createdAtFilter(fromDate, toDate) } : {}),
    },
  });
  return rows.map((o) => ({
    id: toNum(o.id),
    entity_type: "fleet_owner" as const,
    name: o.full_name,
    national_id: o.national_id,
    village_id: null,
    village_name: null,
    status: o.status,
    created_at: o.created_at.toISOString(),
    cooperative_id: coopId,
    ownership_doc_url: o.ownership_doc_url,
    insurance_doc_url: o.insurance_doc_url,
    charter_file_url: o.ownership_doc_url,
  }));
}

async function fetchVehicleInboxRows(
  coopId: number,
  status: KycInboxStatus,
  fromDate?: Date,
  toDate?: Date,
): Promise<KycInboxTableItem[]> {
  const rows = await prisma.vehicles.findMany({
    where: {
      cooperative_id: toBig(coopId),
      status,
      deleted_at: null,
      ...(createdAtFilter(fromDate, toDate) ? { created_at: createdAtFilter(fromDate, toDate) } : {}),
    },
  });
  return rows.map((v) => ({
    id: toNum(v.id),
    entity_type: "vehicle" as const,
    name: v.license_plate,
    national_id: null,
    village_id: null,
    village_name: null,
    status: v.status,
    created_at: v.created_at.toISOString(),
    cooperative_id: coopId,
    ownership_doc_url: v.ownership_doc_url,
    insurance_doc_url: v.insurance_doc_url,
    charter_file_url: v.ownership_doc_url,
  }));
}

/** Paginated, filterable KYC inbox for coop staff (server-side pagination). */
export async function queryKycInboxPaginated(params: KycInboxQueryParams): Promise<KycInboxQueryResult> {
  const { coopId, status, villageId, entityType, fromDate, toDate, page, limit, sortField, sortDir } = params;
  const types: KycInboxEntityKind[] = entityType
    ? [entityType]
    : ["household", "driver", "fleet_owner", "vehicle"];

  const fetches: Promise<KycInboxTableItem[]>[] = [];
  for (const t of types) {
    if (t === "household") {
      fetches.push(fetchHouseholdInboxRows(coopId, status, villageId, fromDate, toDate));
    } else if (villageId != null) {
      continue;
    } else if (t === "driver") {
      fetches.push(fetchDriverInboxRows(coopId, status, fromDate, toDate));
    } else if (t === "fleet_owner") {
      fetches.push(fetchFleetOwnerInboxRows(coopId, status, fromDate, toDate));
    } else if (t === "vehicle") {
      fetches.push(fetchVehicleInboxRows(coopId, status, fromDate, toDate));
    }
  }

  const chunks = await Promise.all(fetches);
  let rows = chunks.flat();
  rows.sort((a, b) => compareRows(a, b, sortField, sortDir));

  if (status === "NEEDS_CORRECTION") {
    const byType = new Map<KycInboxEntityKind, KycInboxTableItem[]>();
    for (const r of rows) {
      const list = byType.get(r.entity_type) ?? [];
      list.push(r);
      byType.set(r.entity_type, list);
    }
    const enriched: KycInboxTableItem[] = [];
    for (const [entityTypeKey, list] of byType) {
      const withReasons = await attachCorrectionReasons(entityTypeKey, list);
      enriched.push(...withReasons);
    }
    rows = enriched.sort((a, b) => compareRows(a, b, sortField, sortDir));
  }

  const total = rows.length;
  const offset = (page - 1) * limit;
  const items = rows.slice(offset, offset + limit);

  return { items, total, page, limit };
}
