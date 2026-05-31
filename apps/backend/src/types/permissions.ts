import { normalizeRole, type UserRole } from "./userRole";

/** PLATFORM-LEGAL-1: permissions gate ops UI; platform role is infrastructure — not mine employer. */
/** GOV-WORKFLOW-1: ADMIN = audit/monitor only; settlement approve/lock split by role. */

export const PERMISSIONS = {
  ADMIN: ["audit:read"],
  OPERATION_ADMIN: [
    "ops:*",
    "settlement:read",
    "settlement:approve",
    "settlement:lock",
    "settlement:execute",
    "dispatch:create",
    "hold:create",
    "hold:release",
    "contract:amend",
    "weighbridge:approve",
    "weighbridge:manual_override",
  ],
  COOP_ADMIN: [
    "coop:manage",
    "kyc:approve",
    "members:read",
    "audit:read",
    "objection:create",
    "contract:amend",
    "settlement:approve",
  ],
  COOP_OPERATOR: ["kyc:review", "members:read", "weighbridge:submit", "weighbridge:approve"],
  OPERATOR: ["hourly:start", "hourly:end"],
  CONSULTANT: ["hourly:verify", "hourly:reject"],
  DRIVER: ["mission:read_own", "mission:execute_steps"],
  FLEET_OWNER: ["wallet:read_own", "vehicles:read_own"],
  HOUSEHOLD: ["wallet:read_own", "shares:read_own", "objection:create", "members:read"],
} as const;

/** Legacy EMPLOYER role (NAV-1 / EMP-PERM-1). */
export const EMPLOYER_PERMISSIONS = ["needs:create", "needs:read_own", "needs:cancel"] as const;

export type PermissionKey =
  | "*"
  | "ops:*"
  | "settlement:read"
  | "settlement:approve"
  | "settlement:lock"
  | "settlement:execute"
  | "needs:create"
  | "needs:read_own"
  | "needs:cancel"
  | "dispatch:create"
  | "hold:create"
  | "hold:release"
  | "coop:manage"
  | "kyc:approve"
  | "kyc:review"
  | "members:read"
  | "audit:read"
  | "hourly:start"
  | "hourly:end"
  | "hourly:verify"
  | "hourly:reject"
  | "mission:read_own"
  | "mission:execute_steps"
  | "wallet:read_own"
  | "vehicles:read_own"
  | "shares:read_own"
  | "objection:create"
  | "users:manage"
  | "cooperatives:manage"
  | "contract:amend"
  | "weighbridge:submit"
  | "weighbridge:approve"
  | "weighbridge:manual_override";

/** ADMIN-only: assign roles to users. */
export const ADMIN_EXTRA_PERMISSIONS = ["users:manage", "cooperatives:manage", "hourly:reject"] as const;

function permissionMatches(granted: string, required: string): boolean {
  if (granted === "*") return true;
  if (granted === required) return true;
  if (granted.endsWith(":*")) {
    const prefix = granted.slice(0, -1);
    return required.startsWith(prefix);
  }
  return false;
}

export function listRolePermissions(role: UserRole): string[] {
  if (role === "EMPLOYER") {
    return [...EMPLOYER_PERMISSIONS];
  }
  const normalized = normalizeRole(role);
  const base = [...(PERMISSIONS[normalized as keyof typeof PERMISSIONS] ?? [])];
  if (normalized === "ADMIN") {
    return [...base, ...ADMIN_EXTRA_PERMISSIONS];
  }
  return base;
}

export function hasPermission(role: UserRole, required: string): boolean {
  const perms = listRolePermissions(role);
  return perms.some((p) => permissionMatches(p, required));
}
