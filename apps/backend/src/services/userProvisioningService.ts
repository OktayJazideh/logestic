import type { ProvisioningUnitType } from "@prisma/client";
import { ApiError } from "../http/errors";
import { assertNationalIdFreeForUserAccount } from "../lib/nationalIdEnforcement";
import { normalizeNationalId } from "../lib/nationalId";
import { normalizeOptionalNationalId } from "../lib/identityPolicy";
import { optionalPersianName } from "../lib/persianText";
import { isCoopScopedRole, normalizeRole, type UserRole } from "../types/userRole";
import * as usersRepo from "../repositories/usersRepository";
import * as provisioningRepo from "../repositories/userProvisioningRepository";
import * as workspaceRepo from "../repositories/workspaceMembershipsRepository";

export const MOBILE_REGEX = /^09\d{9}$/;

const COOP_UNIT_ROLES: UserRole[] = ["COOP_ADMIN", "COOP_OPERATOR", "HOUSEHOLD"];
const MINE_OPS_ROLES: UserRole[] = ["OPERATOR", "OPERATION_ADMIN"];
const PLATFORM_ROLES: UserRole[] = ["CONSULTANT", "OPERATOR"];

export function validateMobile(mobile: string, requestId?: string): string {
  const trimmed = mobile.trim();
  if (!MOBILE_REGEX.test(trimmed)) {
    throw new ApiError({
      statusCode: 400,
      code: "invalid_mobile",
      message: "Invalid mobile number",
      requestId,
    });
  }
  return trimmed;
}

export async function assertMobileAvailable(
  mobile: string,
  excludeUserId?: number,
  requestId?: string,
  excludeProvisioningRequestId?: number,
): Promise<void> {
  const existing = await provisioningRepo.findUserByMobileIncludingDeleted(mobile);
  if (existing) {
    if (existing.deleted_at) return;
    const existingId = Number(existing.id);
    if (!excludeUserId || existingId !== excludeUserId) {
      throw new ApiError({
        statusCode: 409,
        code: "mobile_taken",
        message: "Mobile number is already registered",
        requestId,
      });
    }
  }
  const pendingMobile = await provisioningRepo.findPendingByMobile(mobile, excludeProvisioningRequestId);
  if (pendingMobile) {
    throw new ApiError({
      statusCode: 409,
      code: "mobile_pending",
      message: "Mobile number has a pending provisioning request",
      requestId,
    });
  }
}

export async function assertProvisioningIdentityAvailable(
  mobile: string,
  nationalId?: string | null,
  excludeUserId?: number,
  requestId?: string,
  excludeProvisioningRequestId?: number,
): Promise<{ mobile: string; national_id: string | null }> {
  const mobileNorm = validateMobile(mobile, requestId);
  await assertMobileAvailable(mobileNorm, excludeUserId, requestId, excludeProvisioningRequestId);

  const natRaw = normalizeOptionalNationalId(nationalId);
  let national_id: string | null = null;

  if (natRaw) {
    national_id = await assertNationalIdFreeForUserAccount(natRaw, excludeUserId, undefined, requestId);
    const pendingNat = await provisioningRepo.findPendingByNationalId(
      national_id,
      excludeProvisioningRequestId,
    );
    if (pendingNat) {
      throw new ApiError({
        statusCode: 409,
        code: "national_id_pending",
        message: "A pending provisioning request already exists for this national ID",
        requestId,
      });
    }
  }

  return { mobile: mobileNorm, national_id };
}

export function assertRoleAllowedForUnit(
  unitType: ProvisioningUnitType,
  targetRole: UserRole,
  requestId?: string,
): void {
  const allowed =
    unitType === "COOPERATIVE"
      ? COOP_UNIT_ROLES
      : unitType === "MINE_OPS"
        ? MINE_OPS_ROLES
        : PLATFORM_ROLES;
  if (!allowed.includes(targetRole)) {
    throw new ApiError({
      statusCode: 400,
      code: "invalid_role_for_unit",
      message: "Role not allowed for this unit type",
      requestId,
    });
  }
}

export function resolveUnitTypeForRequester(
  role: UserRole,
  bodyUnit?: ProvisioningUnitType,
  requestId?: string,
): ProvisioningUnitType {
  const n = normalizeRole(role);
  if (n === "COOP_ADMIN") return "COOPERATIVE";
  if (n === "OPERATION_ADMIN") return bodyUnit ?? "MINE_OPS";
  throw new ApiError({ statusCode: 403, code: "forbidden", message: "Unsupported requester role", requestId });
}

export async function createProvisioningRequest(input: {
  requesterUserId: number;
  requesterRole: UserRole;
  cooperativeId?: number;
  mineId?: number;
  unit_type?: ProvisioningUnitType;
  target_role: UserRole;
  mobile_number: string;
  national_id?: string | null;
  full_name?: string;
  note?: string;
  requestId?: string;
}) {
  const unit_type =
    input.unit_type ?? resolveUnitTypeForRequester(input.requesterRole, input.unit_type, input.requestId);
  assertRoleAllowedForUnit(unit_type, input.target_role, input.requestId);

  const n = normalizeRole(input.requesterRole);
  let cooperative_id = input.cooperativeId;
  let mine_id = input.mineId;

  if (n === "COOP_ADMIN") {
    if (!cooperative_id) {
      throw new ApiError({
        statusCode: 403,
        code: "cooperative_required",
        message: "Cooperative scope required",
        requestId: input.requestId,
      });
    }
    if (unit_type !== "COOPERATIVE") {
      throw new ApiError({ statusCode: 403, code: "forbidden", message: "Forbidden", requestId: input.requestId });
    }
  }

  if (n === "OPERATION_ADMIN") {
    if (!mine_id) {
      throw new ApiError({
        statusCode: 400,
        code: "mine_required",
        message: "Select workspace (mine) first",
        requestId: input.requestId,
      });
    }
    try {
      await workspaceRepo.assertOperationalMineAccess({
        userId: input.requesterUserId,
        userRole: input.requesterRole,
        mineId: mine_id,
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "workspace_access_denied") {
        throw new ApiError({
          statusCode: 403,
          code: "workspace_access_denied",
          message: "Workspace access denied for this mine",
          requestId: input.requestId,
        });
      }
      throw e;
    }
  }

  if (isCoopScopedRole(input.target_role) && !cooperative_id) {
    throw new ApiError({
      statusCode: 400,
      code: "cooperative_required",
      message: "cooperative_id is required for cooperative roles",
      requestId: input.requestId,
    });
  }

  const identity = await assertProvisioningIdentityAvailable(
    input.mobile_number,
    input.national_id,
    undefined,
    input.requestId,
  );

  const full_name = optionalPersianName(input.full_name, input.requestId);

  return provisioningRepo.createProvisioningRequest({
    unit_type,
    requester_user_id: input.requesterUserId,
    cooperative_id,
    mine_id,
    target_role: input.target_role,
    mobile_number: identity.mobile,
    national_id: identity.national_id,
    full_name,
    note: input.note?.trim() || undefined,
  });
}

export async function createUserDirect(input: {
  mobile_number: string;
  national_id?: string | null;
  role: UserRole;
  cooperative_id?: number | null;
  full_name?: string;
  is_active?: boolean;
  requestId?: string;
  excludeProvisioningRequestId?: number;
}) {
  if (isCoopScopedRole(input.role) && input.cooperative_id == null) {
    throw new ApiError({
      statusCode: 400,
      code: "cooperative_required",
      message: "cooperative_id is required for COOP roles",
      requestId: input.requestId,
    });
  }

  const identity = await assertProvisioningIdentityAvailable(
    input.mobile_number,
    input.national_id,
    undefined,
    input.requestId,
    input.excludeProvisioningRequestId,
  );

  const full_name = optionalPersianName(input.full_name, input.requestId);

  const existing = await provisioningRepo.findUserByMobileIncludingDeleted(identity.mobile);
  if (existing) {
    if (existing.deleted_at) {
      const restored = await usersRepo.restoreUser(Number(existing.id), {
        mobile_number: identity.mobile,
        national_id: identity.national_id,
        role: input.role,
        cooperative_id: input.cooperative_id ?? null,
        full_name: full_name ?? null,
        is_active: input.is_active ?? true,
      });
      if (!restored) {
        throw new ApiError({
          statusCode: 500,
          code: "restore_failed",
          message: "Failed to restore user",
          requestId: input.requestId,
        });
      }
      return restored;
    }
    throw new ApiError({
      statusCode: 409,
      code: "mobile_taken",
      message: "Mobile number is already registered",
      requestId: input.requestId,
    });
  }

  return usersRepo.createUser({
    mobile_number: identity.mobile,
    national_id: identity.national_id,
    role: input.role,
    cooperative_id: input.cooperative_id ?? undefined,
    full_name,
    is_active: input.is_active ?? true,
  });
}

export async function approveProvisioningRequest(
  requestId: number,
  reviewerUserId: number,
  httpRequestId?: string,
) {
  const req = await provisioningRepo.findProvisioningRequestById(requestId);
  if (!req) {
    throw new ApiError({ statusCode: 404, code: "not_found", message: "Request not found", requestId: httpRequestId });
  }
  if (req.status !== "PENDING") {
    throw new ApiError({
      statusCode: 400,
      code: "invalid_status",
      message: "Request is not pending",
      requestId: httpRequestId,
    });
  }

  await assertProvisioningIdentityAvailable(
    req.mobile_number,
    req.national_id,
    undefined,
    httpRequestId,
    requestId,
  );

  const user = await createUserDirect({
    mobile_number: req.mobile_number,
    national_id: req.national_id,
    role: req.target_role,
    cooperative_id: req.cooperative_id ?? null,
    full_name: req.full_name,
    is_active: true,
    requestId: httpRequestId,
    excludeProvisioningRequestId: requestId,
  });

  if (!user) {
    throw new ApiError({
      statusCode: 500,
      code: "create_failed",
      message: "Failed to create user",
      requestId: httpRequestId,
    });
  }

  const updated = await provisioningRepo.approveProvisioningRequest(requestId, reviewerUserId, user.id);
  return { request: updated, user };
}

export async function updateUserAdmin(
  userId: number,
  patch: {
    role?: UserRole;
    cooperative_id?: number | null;
    is_active?: boolean;
    full_name?: string | null;
    national_id?: string | null;
    mobile_number?: string;
  },
  httpRequestId?: string,
) {
  const existing = await usersRepo.findUserById(userId);
  if (!existing) {
    throw new ApiError({ statusCode: 404, code: "user_not_found", message: "User not found", requestId: httpRequestId });
  }

  if (patch.mobile_number && patch.mobile_number !== existing.mobile_number) {
    await assertMobileAvailable(patch.mobile_number, userId, httpRequestId);
  }

  const natPatch = patch.national_id !== undefined ? normalizeOptionalNationalId(patch.national_id) : undefined;
  if (natPatch) {
    await assertNationalIdFreeForUserAccount(natPatch, userId, undefined, httpRequestId);
  }

  const role = patch.role ?? existing.role;
  let cooperative_id = patch.cooperative_id;
  if (isCoopScopedRole(role) && cooperative_id === undefined) {
    cooperative_id = existing.cooperative_id ?? null;
  }
  if (!isCoopScopedRole(role)) {
    cooperative_id = null;
  }
  if (isCoopScopedRole(role) && (cooperative_id == null || cooperative_id === undefined)) {
    throw new ApiError({
      statusCode: 400,
      code: "cooperative_required",
      message: "cooperative_id is required for COOP roles",
      requestId: httpRequestId,
    });
  }

  let full_name: string | null | undefined = patch.full_name;
  if (patch.full_name !== undefined) {
    full_name = patch.full_name === null ? null : (optionalPersianName(patch.full_name, httpRequestId) ?? null);
  }

  const national_id =
    patch.national_id !== undefined
      ? natPatch
        ? normalizeNationalId(natPatch)
        : null
      : undefined;

  return usersRepo.updateUser(userId, {
    role: patch.role,
    cooperative_id,
    is_active: patch.is_active,
    full_name,
    national_id,
  });
}

export async function softDeleteUserAdmin(userId: number, httpRequestId?: string) {
  const existing = await usersRepo.findUserById(userId);
  if (!existing) {
    throw new ApiError({ statusCode: 404, code: "user_not_found", message: "User not found", requestId: httpRequestId });
  }
  return usersRepo.deactivateAndSoftDeleteUser(userId);
}
