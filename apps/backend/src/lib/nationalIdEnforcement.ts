import type { PrismaClient } from "@prisma/client";
import { prisma } from "../db/prisma";
import { ApiError } from "../http/errors";
import { normalizeNationalId, validateIranNationalIdChecksum } from "./nationalId";
import { runWithSoftDeleteBypass } from "./softDelete";
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

/** Cross-table check before assigning national_id to a user account. */
export async function assertNationalIdFreeForUserAccount(
  nationalId: string,
  excludeUserId?: number,
  db: PrismaClient = prisma,
  requestId?: string,
): Promise<string> {
  const normalized = normalizeNationalId(nationalId);
  if (!validateIranNationalIdChecksum(normalized)) {
    throw new ApiError({
      statusCode: 400,
      code: "invalid_national_id",
      message: "Invalid national ID",
      requestId,
    });
  }

  const excludeBig = excludeUserId != null && excludeUserId > 0 ? toBig(excludeUserId) : null;
  const existingUser = await runWithSoftDeleteBypass(() =>
    db.users.findFirst({ where: { national_id: normalized } }),
  );
  if (existingUser && (!excludeBig || existingUser.id !== excludeBig)) {
    throw nationalIdConflictError(requestId);
  }

  await assertNationalIdAvailable("cooperative", null, normalized, db, requestId);
  await assertNationalIdAvailable("household", null, normalized, db, requestId);
  await assertNationalIdAvailable("fleet_owner", null, normalized, db, requestId);
  return normalized;
}
