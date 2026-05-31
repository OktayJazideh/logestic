import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { toBig, toNum } from "../repositories/id";
import * as objectionsRepo from "../repositories/objectionsRepository";

/** Build OR-clauses so COOP_ADMIN only sees audit rows for their cooperative. */
export async function buildCoopScopedAuditWhere(coopId: number): Promise<Prisma.audit_logsWhereInput> {
  const coopStr = String(coopId);
  const or: Prisma.audit_logsWhereInput[] = [{ entity_type: "cooperative", entity_id: coopStr }];

  const [households, drivers, fleetOwners, vehicles, users] = await Promise.all([
    prisma.households.findMany({ where: { cooperative_id: toBig(coopId) }, select: { id: true } }),
    prisma.drivers.findMany({ where: { cooperative_id: toBig(coopId) }, select: { id: true } }),
    prisma.fleet_owners.findMany({ where: { cooperative_id: toBig(coopId) }, select: { id: true } }),
    prisma.vehicles.findMany({ where: { cooperative_id: toBig(coopId) }, select: { id: true } }),
    prisma.users.findMany({ where: { cooperative_id: toBig(coopId) }, select: { id: true } }),
  ]);

  const ids = (rows: { id: bigint }[]) => rows.map((r) => String(toNum(r.id)));

  const hIds = ids(households);
  if (hIds.length) or.push({ entity_type: "household", entity_id: { in: hIds } });
  const dIds = ids(drivers);
  if (dIds.length) or.push({ entity_type: "driver", entity_id: { in: dIds } });
  const fIds = ids(fleetOwners);
  if (fIds.length) or.push({ entity_type: "fleet_owner", entity_id: { in: fIds } });
  const vIds = ids(vehicles);
  if (vIds.length) or.push({ entity_type: "vehicle", entity_id: { in: vIds } });
  const uIds = ids(users);
  if (uIds.length) or.push({ entity_type: "user", entity_id: { in: uIds } });

  const objectionIds = await objectionsRepo.listObjectionIdsByCooperative(coopId);
  if (objectionIds.length) {
    or.push({ entity_type: "membership_objection", entity_id: { in: objectionIds } });
  }

  return { OR: or };
}
