/**
 * Fallback permission list when /auth/myPermissions is missing or stale.
 * Keep in sync with apps/backend/src/types/permissions.ts
 */
function normalizeRole(role: string): string {
  return role === "COOP" ? "COOP_ADMIN" : role;
}

const COOP_ADMIN_PERMS = [
  "coop:manage",
  "kyc:approve",
  "members:read",
  "audit:read",
  "objection:create",
  "contract:amend",
  "settlement:approve",
  "users:request",
] as const;

const OPERATION_ADMIN_PERMS = [
  "ops:*",
  "users:request",
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
] as const;

const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  ADMIN: ["audit:read", "users:manage", "cooperatives:manage", "hourly:reject"],
  OPERATION_ADMIN: OPERATION_ADMIN_PERMS,
  COOP_ADMIN: COOP_ADMIN_PERMS,
  COOP: COOP_ADMIN_PERMS,
  COOP_OPERATOR: ["kyc:review", "members:read", "weighbridge:submit", "weighbridge:approve"],
  OPERATOR: ["hourly:start", "hourly:end"],
  CONSULTANT: ["hourly:verify", "hourly:reject"],
  DRIVER: ["mission:read_own", "mission:execute_steps"],
  FLEET_OWNER: ["wallet:read_own", "vehicles:read_own"],
  HOUSEHOLD: ["wallet:read_own", "shares:read_own", "objection:create", "members:read"],
  EMPLOYER: ["needs:create", "needs:read_own", "needs:cancel"],
};

/** Permissions for panel UI when API list is empty or outdated. */
export function permissionsForRole(role: string | undefined): string[] {
  if (!role) return [];
  const key = normalizeRole(role);
  return [...(ROLE_PERMISSIONS[key] ?? ROLE_PERMISSIONS[role] ?? [])];
}
