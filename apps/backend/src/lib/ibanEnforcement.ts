import type { PrismaClient } from "@prisma/client";
import { prisma } from "../db/prisma";
import { ApiError } from "../http/errors";
import { normalizeIban, validateIranIbanChecksum } from "./iban";
import { toBig } from "../repositories/id";

export type IbanEntityType = "household" | "fleet_owner";

export const IBAN_CONFLICT_CODE = "iban_taken";
export const IBAN_CONFLICT_MESSAGE = "Bank IBAN is already registered";

export function ibanConflictError(requestId?: string): ApiError {
  return new ApiError({
    statusCode: 409,
    code: IBAN_CONFLICT_CODE,
    message: IBAN_CONFLICT_MESSAGE,
    requestId,
  });
}

export function normalizeAndValidateIban(iban: string, requestId?: string): string {
  const n = normalizeIban(iban);
  if (!/^IR\d{24}$/.test(n) || !validateIranIbanChecksum(n)) {
    throw new ApiError({
      statusCode: 400,
      code: "invalid_iban",
      message: "Invalid IBAN",
      requestId,
    });
  }
  return n;
}

export async function assertIbanAvailable(
  entityType: IbanEntityType,
  iban: string,
  excludeEntityId?: number,
  db: PrismaClient = prisma,
  requestId?: string,
): Promise<string> {
  const normalized = normalizeAndValidateIban(iban, requestId);
  const excludeId = excludeEntityId != null && excludeEntityId > 0 ? toBig(excludeEntityId) : null;

  if (entityType === "household") {
    const found = await db.households.findFirst({
      where: { bank_iban: normalized },
    });
    if (found && (!excludeId || found.id !== excludeId)) throw ibanConflictError(requestId);
    const fleet = await db.fleet_owners.findFirst({ where: { bank_iban: normalized } });
    if (fleet) throw ibanConflictError(requestId);
    const user = await db.users.findFirst({ where: { bank_iban: normalized } });
    if (user) throw ibanConflictError(requestId);
    return normalized;
  }

  const found = await db.fleet_owners.findFirst({ where: { bank_iban: normalized } });
  if (found && (!excludeId || found.id !== excludeId)) throw ibanConflictError(requestId);
  const hh = await db.households.findFirst({ where: { bank_iban: normalized } });
  if (hh) throw ibanConflictError(requestId);
  const user = await db.users.findFirst({ where: { bank_iban: normalized } });
  if (user) throw ibanConflictError(requestId);
  return normalized;
}

/** Cross-table IBAN check before assigning to a user account or provisioning request. */
export async function assertUserIbanAvailable(
  iban: string,
  excludeUserId?: number,
  excludeProvisioningRequestId?: number,
  db: PrismaClient = prisma,
  requestId?: string,
): Promise<string> {
  const normalized = normalizeAndValidateIban(iban, requestId);
  const excludeUserBig = excludeUserId != null && excludeUserId > 0 ? toBig(excludeUserId) : null;
  const excludeReqBig =
    excludeProvisioningRequestId != null && excludeProvisioningRequestId > 0
      ? toBig(excludeProvisioningRequestId)
      : null;

  const user = await db.users.findFirst({ where: { bank_iban: normalized } });
  if (user && (!excludeUserBig || user.id !== excludeUserBig)) throw ibanConflictError(requestId);

  const hh = await db.households.findFirst({ where: { bank_iban: normalized } });
  if (hh) throw ibanConflictError(requestId);

  const fleet = await db.fleet_owners.findFirst({ where: { bank_iban: normalized } });
  if (fleet) throw ibanConflictError(requestId);

  const pending = await db.user_provisioning_requests.findFirst({
    where: {
      status: "PENDING",
      bank_iban: normalized,
      ...(excludeReqBig ? { NOT: { id: excludeReqBig } } : {}),
    },
  });
  if (pending) throw ibanConflictError(requestId);

  return normalized;
}
