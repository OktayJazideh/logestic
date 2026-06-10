import type { ProvisioningUnitType } from "@prisma/client";
import { ApiError } from "../http/errors";
import { assertNationalIdFreeForUserAccount } from "../lib/nationalIdEnforcement";
import { normalizeNationalId } from "../lib/nationalId";
import { normalizeOptionalNationalId } from "../lib/identityPolicy";
import { assertUserIbanAvailable } from "../lib/ibanEnforcement";
import {
  hashPassword,
  normalizeUsername,
  validatePassword,
  validateUsername,
} from "../lib/passwordHash";
import { optionalPersianName } from "../lib/persianText";
import { isCoopScopedRole, normalizeRole, type UserRole } from "../types/userRole";
import { prisma } from "../db/prisma";
import { toBig, toNum } from "../repositories/id";
import * as cooperativesRepo from "../repositories/cooperativesRepository";
import * as usersRepo from "../repositories/usersRepository";
import * as provisioningRepo from "../repositories/userProvisioningRepository";
import {
  assertOperationalMineAccess,
  membershipKindForRole,
  upsertMembership as upsertWorkspaceMembership,
} from "../repositories/workspaceMembershipsRepository";

export const MOBILE_REGEX = /^09\d{9}$/;

type CredentialInput = { username?: string | null; password?: string | null };

async function assertUsernameAvailable(
  username: string,
  excludeUserId?: number,
  requestId?: string,
): Promise<string> {
  const normalized = normalizeUsername(username);
  const formatErr = validateUsername(normalized);
  if (formatErr) {
    throw new ApiError({ statusCode: 400, code: "invalid_username", message: formatErr, requestId });
  }
  const taken = excludeUserId
    ? await usersRepo.findUserByUsernameExcluding(normalized, excludeUserId)
    : await usersRepo.findUserByUsername(normalized);
  if (taken) {
    throw new ApiError({
      statusCode: 409,
      code: "username_taken",
      message: "Username is already taken",
      requestId,
    });
  }
  return normalized;
}

async function resolveCredentialPatch(
  input: CredentialInput,
  opts?: { excludeUserId?: number; existingUsername?: string | null; requestId?: string },
): Promise<{ username?: string | null; password_hash?: string }> {
  const patch: { username?: string | null; password_hash?: string } = {};
  const requestId = opts?.requestId;

  if (input.username !== undefined) {
    if (input.username === null || input.username.trim() === "") {
      patch.username = null;
    } else {
      patch.username = await assertUsernameAvailable(input.username, opts?.excludeUserId, requestId);
    }
  }

  const password = input.password?.trim();
  if (password) {
    const pwdErr = validatePassword(password);
    if (pwdErr) {
      throw new ApiError({ statusCode: 400, code: "invalid_password", message: pwdErr, requestId });
    }
    const effectiveUsername =
      patch.username !== undefined ? patch.username : (opts?.existingUsername ?? null);
    if (!effectiveUsername) {
      throw new ApiError({
        statusCode: 400,
        code: "username_required",
        message: "username is required when setting a password",
        requestId,
      });
    }
    patch.password_hash = await hashPassword(password);
  }

  return patch;
}

/** Platform ADMIN sees every mine without an explicit workspace membership row. */
export function isGlobalWorkspaceRole(role: UserRole): boolean {
  return normalizeRole(role) === "ADMIN";
}

function roleInWorkspaceForMembership(role: UserRole): UserRole {
  if (role === "COOP") return "COOP_ADMIN";
  return role;
}

function membershipCooperativeId(role: UserRole, cooperativeId?: number | null): number | undefined {
  if (cooperativeId == null) return undefined;
  if (
    isCoopScopedRole(role) ||
    role === "HOUSEHOLD" ||
    role === "DRIVER" ||
    role === "FLEET_OWNER"
  ) {
    return cooperativeId;
  }
  return undefined;
}

/** Ensures user can select the target mine in workspace-select (TENANT-1). */
export async function syncWorkspaceMembershipForUser(input: {
  userId: number;
  role: UserRole;
  mineId?: number | null;
  cooperativeId?: number | null;
  requestId?: string;
}): Promise<void> {
  if (isGlobalWorkspaceRole(input.role)) return;
  if (!membershipKindForRole(input.role)) return;

  let mineId = input.mineId ?? null;
  let cooperativeId = input.cooperativeId ?? null;

  if (isCoopScopedRole(input.role) || input.role === "HOUSEHOLD") {
    if (cooperativeId == null) {
      throw new ApiError({
        statusCode: 400,
        code: "cooperative_required",
        message: "cooperative_id is required for COOP roles",
        requestId: input.requestId,
      });
    }
    const coop = await cooperativesRepo.findCooperativeById(cooperativeId);
    if (!coop) {
      throw new ApiError({
        statusCode: 404,
        code: "not_found",
        message: "Cooperative not found",
        requestId: input.requestId,
      });
    }
    if (mineId != null && coop.mine_id !== mineId) {
      throw new ApiError({
        statusCode: 400,
        code: "cooperative_mine_mismatch",
        message: "Cooperative does not belong to the selected mine",
        requestId: input.requestId,
      });
    }
    mineId = coop.mine_id;
  } else if (cooperativeId != null) {
    const coop = await cooperativesRepo.findCooperativeById(cooperativeId);
    if (!coop) {
      throw new ApiError({
        statusCode: 404,
        code: "not_found",
        message: "Cooperative not found",
        requestId: input.requestId,
      });
    }
    if (mineId != null && coop.mine_id !== mineId) {
      throw new ApiError({
        statusCode: 400,
        code: "cooperative_mine_mismatch",
        message: "Cooperative does not belong to the selected mine",
        requestId: input.requestId,
      });
    }
    mineId = mineId ?? coop.mine_id;
  }

  if (mineId == null) {
    throw new ApiError({
      statusCode: 400,
      code: "mine_id_required",
      message: "mine_id is required for this role",
      requestId: input.requestId,
    });
  }

  await upsertWorkspaceMembership({
    user_id: input.userId,
    mine_id: mineId,
    cooperative_id: membershipCooperativeId(input.role, cooperativeId),
    role_in_workspace: roleInWorkspaceForMembership(input.role),
    status: "ACTIVE",
  });
}

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

type ScopedProfile = {
  national_id: string | null;
  bank_iban: string | null;
  village_id: number | null;
};

async function resolveMineIdForScope(input: {
  mineId?: number | null;
  cooperativeId?: number | null;
  requestId?: string;
}): Promise<number | null> {
  let mineId = input.mineId ?? null;
  if (input.cooperativeId != null) {
    const coop = await cooperativesRepo.findCooperativeById(input.cooperativeId);
    if (!coop) {
      throw new ApiError({
        statusCode: 404,
        code: "not_found",
        message: "Cooperative not found",
        requestId: input.requestId,
      });
    }
    if (mineId != null && coop.mine_id !== mineId) {
      throw new ApiError({
        statusCode: 400,
        code: "cooperative_mine_mismatch",
        message: "Cooperative does not belong to the selected mine",
        requestId: input.requestId,
      });
    }
    mineId = mineId ?? coop.mine_id;
  }
  return mineId;
}

async function assertVillageInMine(
  villageId: number,
  mineId: number,
  requestId?: string,
): Promise<void> {
  const village = await prisma.villages.findUnique({ where: { id: toBig(villageId) } });
  if (!village || toNum(village.mine_id) !== mineId) {
    throw new ApiError({
      statusCode: 400,
      code: "village_mine_mismatch",
      message: "Village does not belong to the selected mine",
      requestId,
    });
  }
}

/** Validates national_id, IBAN, village for mine-scoped roles. */
export async function resolveScopedProfileFields(input: {
  role: UserRole;
  national_id?: string | null;
  bank_iban?: string | null;
  village_id?: number | null;
  mine_id?: number | null;
  cooperative_id?: number | null;
  excludeUserId?: number;
  excludeProvisioningRequestId?: number;
  requestId?: string;
}): Promise<ScopedProfile> {
  if (isGlobalWorkspaceRole(input.role)) {
    const natRaw = normalizeOptionalNationalId(input.national_id);
    let national_id: string | null = null;
    if (natRaw) {
      national_id = await assertNationalIdFreeForUserAccount(
        natRaw,
        input.excludeUserId,
        undefined,
        input.requestId,
      );
    }
    return { national_id, bank_iban: null, village_id: null };
  }

  const natRaw = normalizeOptionalNationalId(input.national_id);
  if (!natRaw) {
    throw new ApiError({
      statusCode: 400,
      code: "national_id_required",
      message: "national_id is required for this role",
      requestId: input.requestId,
    });
  }
  if (!input.bank_iban?.trim()) {
    throw new ApiError({
      statusCode: 400,
      code: "bank_iban_required",
      message: "bank_iban is required for this role",
      requestId: input.requestId,
    });
  }
  if (input.village_id == null || input.village_id <= 0) {
    throw new ApiError({
      statusCode: 400,
      code: "village_id_required",
      message: "village_id is required for this role",
      requestId: input.requestId,
    });
  }

  const mineId = await resolveMineIdForScope({
    mineId: input.mine_id,
    cooperativeId: input.cooperative_id,
    requestId: input.requestId,
  });
  if (mineId == null) {
    throw new ApiError({
      statusCode: 400,
      code: "mine_id_required",
      message: "mine_id is required for this role",
      requestId: input.requestId,
    });
  }

  await assertVillageInMine(input.village_id, mineId, input.requestId);

  const national_id = await assertNationalIdFreeForUserAccount(
    natRaw,
    input.excludeUserId,
    undefined,
    input.requestId,
  );
  const pendingNat = await provisioningRepo.findPendingByNationalId(
    national_id,
    input.excludeProvisioningRequestId,
  );
  if (pendingNat) {
    throw new ApiError({
      statusCode: 409,
      code: "national_id_pending",
      message: "A pending provisioning request already exists for this national ID",
      requestId: input.requestId,
    });
  }

  const bank_iban = await assertUserIbanAvailable(
    input.bank_iban,
    input.excludeUserId,
    input.excludeProvisioningRequestId,
    undefined,
    input.requestId,
  );

  return { national_id, bank_iban, village_id: input.village_id };
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
  village_id?: number;
  unit_type?: ProvisioningUnitType;
  target_role: UserRole;
  mobile_number: string;
  national_id?: string | null;
  bank_iban?: string | null;
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
      await assertOperationalMineAccess({
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

  const profile = await resolveScopedProfileFields({
    role: input.target_role,
    national_id: identity.national_id ?? input.national_id,
    bank_iban: input.bank_iban,
    village_id: input.village_id,
    mine_id: mine_id,
    cooperative_id: cooperative_id,
    requestId: input.requestId,
  });

  const full_name = optionalPersianName(input.full_name, input.requestId);

  return provisioningRepo.createProvisioningRequest({
    unit_type,
    requester_user_id: input.requesterUserId,
    cooperative_id,
    mine_id,
    village_id: profile.village_id ?? undefined,
    target_role: input.target_role,
    mobile_number: identity.mobile,
    national_id: profile.national_id,
    bank_iban: profile.bank_iban,
    full_name,
    note: input.note?.trim() || undefined,
  });
}

export async function createUserDirect(input: {
  mobile_number: string;
  username?: string | null;
  password?: string | null;
  national_id?: string | null;
  bank_iban?: string | null;
  village_id?: number | null;
  role: UserRole;
  cooperative_id?: number | null;
  mine_id?: number | null;
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

  const profile = await resolveScopedProfileFields({
    role: input.role,
    national_id: identity.national_id ?? input.national_id,
    bank_iban: input.bank_iban,
    village_id: input.village_id,
    mine_id: input.mine_id,
    cooperative_id: input.cooperative_id,
    excludeProvisioningRequestId: input.excludeProvisioningRequestId,
    requestId: input.requestId,
  });

  const full_name = optionalPersianName(input.full_name, input.requestId);
  const credentialPatch = await resolveCredentialPatch(
    { username: input.username, password: input.password },
    { requestId: input.requestId },
  );

  const existing = await provisioningRepo.findUserByMobileIncludingDeleted(identity.mobile);
  if (existing) {
    if (existing.deleted_at) {
      const restored = await usersRepo.restoreUser(Number(existing.id), {
        mobile_number: identity.mobile,
        national_id: profile.national_id,
        bank_iban: profile.bank_iban,
        village_id: profile.village_id,
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
      await syncWorkspaceMembershipForUser({
        userId: restored.id,
        role: input.role,
        mineId: input.mine_id,
        cooperativeId: input.cooperative_id,
        requestId: input.requestId,
      });
      if (credentialPatch.username !== undefined || credentialPatch.password_hash !== undefined) {
        const withCreds = await usersRepo.updateUserCredentials(restored.id, credentialPatch);
        return withCreds ?? restored;
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

  const user = await usersRepo.createUser({
    mobile_number: identity.mobile,
    username: credentialPatch.username ?? null,
    password_hash: credentialPatch.password_hash,
    national_id: profile.national_id,
    bank_iban: profile.bank_iban,
    village_id: profile.village_id,
    role: input.role,
    cooperative_id: input.cooperative_id ?? undefined,
    full_name,
    is_active: input.is_active ?? true,
  });

  await syncWorkspaceMembershipForUser({
    userId: user.id,
    role: input.role,
    mineId: input.mine_id,
    cooperativeId: input.cooperative_id,
    requestId: input.requestId,
  });

  return user;
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
    bank_iban: req.bank_iban,
    village_id: req.village_id,
    role: req.target_role,
    cooperative_id: req.cooperative_id ?? null,
    mine_id: req.mine_id != null ? Number(req.mine_id) : null,
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
    mine_id?: number | null;
    bank_iban?: string | null;
    village_id?: number | null;
    is_active?: boolean;
    full_name?: string | null;
    national_id?: string | null;
    mobile_number?: string;
    username?: string | null;
    password?: string | null;
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

  const roleForProfile = patch.role ?? existing.role;
  const cooperativeForProfile =
    patch.cooperative_id !== undefined ? patch.cooperative_id : existing.cooperative_id ?? null;
  const needsProfileValidation =
    patch.role != null ||
    patch.national_id !== undefined ||
    patch.bank_iban !== undefined ||
    patch.village_id !== undefined ||
    patch.cooperative_id !== undefined ||
    patch.mine_id !== undefined;

  let bank_iban: string | null | undefined = patch.bank_iban;
  let village_id: number | null | undefined = patch.village_id;
  let national_id_final = national_id;

  if (needsProfileValidation && !isGlobalWorkspaceRole(roleForProfile)) {
    const profile = await resolveScopedProfileFields({
      role: roleForProfile,
      national_id:
        patch.national_id !== undefined ? patch.national_id : existing.national_id ?? null,
      bank_iban: patch.bank_iban !== undefined ? patch.bank_iban : existing.bank_iban ?? null,
      village_id: patch.village_id !== undefined ? patch.village_id : existing.village_id ?? null,
      mine_id: patch.mine_id,
      cooperative_id: cooperativeForProfile,
      excludeUserId: userId,
      requestId: httpRequestId,
    });
    national_id_final = profile.national_id;
    bank_iban = profile.bank_iban;
    village_id = profile.village_id;
  } else if (isGlobalWorkspaceRole(roleForProfile)) {
    if (patch.bank_iban !== undefined) bank_iban = null;
    if (patch.village_id !== undefined) village_id = null;
  }

  const credentialPatch = await resolveCredentialPatch(
    { username: patch.username, password: patch.password },
    { excludeUserId: userId, existingUsername: existing.username, requestId: httpRequestId },
  );

  const updated = await usersRepo.updateUser(userId, {
    role: patch.role,
    cooperative_id,
    bank_iban,
    village_id,
    is_active: patch.is_active,
    full_name,
    national_id: national_id_final,
  });
  if (!updated) {
    throw new ApiError({
      statusCode: 404,
      code: "user_not_found",
      message: "User not found",
      requestId: httpRequestId,
    });
  }

  let result = updated;
  if (credentialPatch.username !== undefined || credentialPatch.password_hash !== undefined) {
    const withCreds = await usersRepo.updateUserCredentials(userId, credentialPatch);
    if (withCreds) result = withCreds;
  }

  if (patch.mine_id != null || patch.role != null || patch.cooperative_id !== undefined) {
    if (!isGlobalWorkspaceRole(updated.role)) {
      await syncWorkspaceMembershipForUser({
        userId,
        role: updated.role,
        mineId: patch.mine_id ?? undefined,
        cooperativeId: updated.cooperative_id,
        requestId: httpRequestId,
      });
    }
  }

  return result;
}

/** One-off: set username/password for an existing user by mobile (no role changes). */
export async function setUserCredentialsByMobile(input: {
  mobile_number: string;
  username: string;
  password: string;
}) {
  const user = await usersRepo.findUserByMobile(input.mobile_number);
  if (!user) {
    throw new ApiError({
      statusCode: 404,
      code: "user_not_found",
      message: `User not found: ${input.mobile_number}`,
    });
  }
  const credentialPatch = await resolveCredentialPatch(
    { username: input.username, password: input.password },
    { excludeUserId: user.id },
  );
  const updated = await usersRepo.updateUserCredentials(user.id, credentialPatch);
  if (!updated) {
    throw new ApiError({ statusCode: 500, code: "update_failed", message: "Failed to update credentials" });
  }
  return updated;
}

export async function softDeleteUserAdmin(userId: number, httpRequestId?: string) {
  const existing = await usersRepo.findUserById(userId);
  if (!existing) {
    throw new ApiError({ statusCode: 404, code: "user_not_found", message: "User not found", requestId: httpRequestId });
  }
  return usersRepo.deactivateAndSoftDeleteUser(userId);
}
