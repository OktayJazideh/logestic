/** Eight official roles per employer architecture spec. */
export const OfficialUserRoles = [
  "ADMIN",
  "OPERATION_ADMIN",
  "COOP_ADMIN",
  "COOP_OPERATOR",
  "OPERATOR",
  "CONSULTANT",
  "DRIVER",
  "FLEET_OWNER",
  "HOUSEHOLD",
] as const;

export type OfficialUserRole = (typeof OfficialUserRoles)[number];

/** Legacy roles kept for backward compatibility (DB rows, old tokens). */
export const LegacyUserRoles = ["COOP", "EMPLOYER"] as const;

export type LegacyUserRole = (typeof LegacyUserRoles)[number];

export const UserRoles = [...OfficialUserRoles, ...LegacyUserRoles] as const;

export type UserRole = (typeof UserRoles)[number];

/** Maps legacy COOP → COOP_ADMIN for permission checks; other roles unchanged. */
export function normalizeRole(role: UserRole): OfficialUserRole | "ADMIN" {
  if (role === "COOP") return "COOP_ADMIN";
  if ((OfficialUserRoles as readonly string[]).includes(role)) {
    return role as OfficialUserRole;
  }
  return role as OfficialUserRole;
}export function isCoopScopedRole(role: UserRole): boolean {
  const n = normalizeRole(role);
  return n === "COOP_ADMIN" || n === "COOP_OPERATOR";
}