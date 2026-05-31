/**
 * GOV-WORKFLOW-1: permission matrix unit checks (no DATABASE_URL).
 * Run 3x: npm run test:gov-workflow-perms
 */
import { hasPermission, listRolePermissions } from "../src/types/permissions";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function runOnce(run: number) {
  assert(!hasPermission("ADMIN", "settlement:lock"), `run ${run}: ADMIN no lock`);
  assert(!hasPermission("ADMIN", "settlement:approve"), `run ${run}: ADMIN no approve`);
  assert(!hasPermission("ADMIN", "settlement:execute"), `run ${run}: ADMIN no execute`);
  assert(hasPermission("ADMIN", "audit:read"), `run ${run}: ADMIN audit`);
  assert(hasPermission("ADMIN", "users:manage"), `run ${run}: ADMIN users:manage`);

  assert(hasPermission("OPERATION_ADMIN", "settlement:approve"), `run ${run}: OP approve`);
  assert(hasPermission("OPERATION_ADMIN", "settlement:lock"), `run ${run}: OP lock`);
  assert(hasPermission("OPERATION_ADMIN", "settlement:execute"), `run ${run}: OP execute`);
  assert(hasPermission("OPERATION_ADMIN", "weighbridge:approve"), `run ${run}: OP wb`);

  assert(hasPermission("COOP_ADMIN", "settlement:approve"), `run ${run}: COOP approve`);
  assert(!hasPermission("COOP_ADMIN", "settlement:lock"), `run ${run}: COOP no lock`);
  assert(!hasPermission("COOP_ADMIN", "weighbridge:approve"), `run ${run}: COOP no wb approve`);

  assert(hasPermission("COOP_OPERATOR", "weighbridge:approve"), `run ${run}: COOP_OP wb`);
  assert(!hasPermission("CONSULTANT", "weighbridge:approve"), `run ${run}: CONSULTANT no wb`);

  const adminPerms = listRolePermissions("ADMIN");
  assert(!adminPerms.includes("*"), `run ${run}: ADMIN must not have wildcard`);
  console.log(`run ${run}: permission matrix OK`);
}

for (let i = 1; i <= 3; i++) runOnce(i);
console.log("test-gov-workflow-perms: all 3 runs PASS");
