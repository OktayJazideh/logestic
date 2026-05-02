export const UserRoles = [
  "ADMIN",
  "COOP",
  "EMPLOYER",
  "DRIVER",
  "FLEET_OWNER",
  "HOUSEHOLD",
  "CONSULTANT",
] as const;

export type UserRole = (typeof UserRoles)[number];

