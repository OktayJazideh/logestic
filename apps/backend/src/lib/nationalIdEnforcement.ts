import type { PrismaClient } from "@prisma/client";
import { prisma } from "../db/prisma";
import { ApiError } from "../http/errors";
import { normalizeNationalId } from "./nationalId";
import { toBig } from "../repositories/id";

export type NationalIdEntityType = "cooperative" | "household" | "fleet_owner";

export const NATIONAL_ID_CONFLICT_CODE = "national_id_unavailable";
export const NATIONAL_ID_CONFLICT_MESSAGE = "National ID is not available";

export function nationalIdConflictError(requestId?: string): ApiError {
  return new ApiError({
    statusCode: 409,
    code: NATIONAL_ID_CONFLICT_CODE,
    message: NATIONAL_ID_CONFLICT_MESSAGE,
    requestId,
  });
}

/**
 * Ensures national_id is free for the given entity table (per-schema global unique).
 * When entityId is set, the same entity may keep its existing national_id (upsert/resubmit).
 */
export async function assertNationalIdAvailable(
  entityType: NationalIdEntityType,
  entityId: number | null | undefined,
  nationalId: string,
  db: PrismaClient = prisma,
  requestId?: string,
): Promise<string> {
  const normalized = normalizeNationalId(nationalId);
  if (normalized.length < 5) {
    throw new ApiError({
      statusCode: 400,
      code: "invalid_request",
      message: "Invalid national ID",
      requestId,
    });
  }

  const excludeId = entityId != null && entityId > 0 ? toBig(entityId) : null;

  const conflict = () => {
    throw nationalIdConflictError(requestId);
  };

  if (entityType === "cooperative") {
    const found = await db.cooperatives.findUnique({ where: { national_id: normalized } });
    if (found && (!excludeId || found.id !== excludeId)) conflict();
    return normalized;
  }

  if (entityType === "household") {
    const found = await db.households.findUnique({ where: { national_id: normalized } });
    if (found && (!excludeId || found.id !== excludeId)) conflict();
    return normalized;
  }

  const found = await db.fleet_owners.findUnique({ where: { national_id: normalized } });
  if (found && (!excludeId || found.id !== excludeId)) conflict();
  return normalized;
}
