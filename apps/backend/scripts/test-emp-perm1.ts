/**
 * EMP-PERM-1: EMPLOYER permission matrix on employer needs API.
 * Run 3x: npm run test:emp-perm1
 * Requires: server on TEST_BASE_URL, db:migrate, db:seed.
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { hasPermission } from "../src/types/permissions";
import * as workspaceRepo from "../src/repositories/workspaceMembershipsRepository";
import { closeTestHttpServer, ensureTestHttpServer, getTestBaseUrl } from "./lib/testHttpServer";

let BASE = getTestBaseUrl();

async function http(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function loginAs(mobile: string) {
  await http("/api/auth/request-otp", { method: "POST", body: JSON.stringify({ mobile_number: mobile }) });
  const devOtp = await http(`/api/auth/__dev/otp?mobile_number=${mobile}`);
  const code = devOtp.json?.data?.otp;
  if (!code) throw new Error(`dev otp missing for ${mobile}`);
  const verify = await http("/api/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ mobile_number: mobile, otp_code: code }),
  });
  if (verify.status !== 200 || !verify.json.success) {
    throw new Error(`verify failed for ${mobile}: ${JSON.stringify(verify.json)}`);
  }
  return verify.json.data.access_token as string;
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function selectMine(token: string, mineId: number) {
  const r = await http("/api/mine/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: mineId }),
  });
  assert(r.status === 200 && r.json.success, `mine select failed: ${JSON.stringify(r.json)}`);
}

async function runOnce(run: number) {
  await initAppContext();
  await appContext.mineData.hydrate();

  await appContext.userStore.upsertUserByMobile("09000000007", "EMPLOYER", { is_active: true });
  await appContext.userStore.upsertUserByMobile("09000000002", "OPERATION_ADMIN", { is_active: true });

  assert(hasPermission("EMPLOYER", "needs:create"), `run ${run}: EMPLOYER needs:create`);
  assert(hasPermission("EMPLOYER", "needs:read_own"), `run ${run}: EMPLOYER needs:read_own`);
  assert(hasPermission("EMPLOYER", "needs:cancel"), `run ${run}: EMPLOYER needs:cancel`);
  assert(!hasPermission("EMPLOYER", "users:manage"), `run ${run}: EMPLOYER must not manage users`);
  assert(hasPermission("OPERATION_ADMIN", "ops:*"), `run ${run}: OPERATION_ADMIN ops:*`);

  const employerToken = await loginAs("09000000007");
  const opsToken = await loginAs("09000000002");

  const adminForbidden = await http("/api/admin/users", {
    headers: { Authorization: `Bearer ${employerToken}` },
  });
  assert(adminForbidden.status === 403, `run ${run}: EMPLOYER must not GET /admin/users`);

  await selectMine(employerToken, 1);

  const opsWorkspace = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${opsToken}` },
    body: JSON.stringify({ mine_id: 1, membership_kind: "OPERATIONAL" }),
  });
  assert(opsWorkspace.status === 200 && opsWorkspace.json.success, `run ${run}: ops workspace select failed`);

  const qty = 20 + run;
  const create = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({
      village_id: 1,
      material_type: "ORE",
      quantity_tons: qty,
      note: `emp-perm run ${run}`,
    }),
  });
  assert(create.status === 201 && create.json.success, `run ${run}: create failed: ${JSON.stringify(create.json)}`);
  const need = create.json.data.need as { id: number; employer_user_id: number };
  assert(need.employer_user_id > 0, `run ${run}: employer_user_id missing`);

  const listEmployer = await http("/api/employer/needs", {
    headers: { Authorization: `Bearer ${employerToken}` },
  });
  assert(listEmployer.status === 200, `run ${run}: employer list failed`);
  const own = listEmployer.json.data.needs as { id: number; employer_user_id: number }[];
  assert(own.every((n) => n.employer_user_id === need.employer_user_id), `run ${run}: employer list not scoped to self`);
  assert(own.some((n) => n.id === need.id), `run ${run}: created need not in employer list`);

  const listOps = await http("/api/employer/needs", {
    headers: { Authorization: `Bearer ${opsToken}` },
  });
  assert(listOps.status === 200, `run ${run}: ops list failed`);
  const all = listOps.json.data.needs as { id: number }[];
  assert(all.some((n) => n.id === need.id), `run ${run}: ops must see created need in full list`);

  const opsCreateForbidden = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${opsToken}` },
    body: JSON.stringify({
      village_id: 1,
      material_type: "ORE",
      quantity_tons: 5,
    }),
  });
  assert(opsCreateForbidden.status === 403, `run ${run}: ops must not POST needs (needs:create)`);

  const create2 = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({
      village_id: 1,
      material_type: "ORE",
      quantity_tons: qty + 1,
      note: `emp-perm cancel-other run ${run}`,
    }),
  });
  assert(create2.status === 201, `run ${run}: second create failed`);
  const otherNeed = create2.json.data.need as { id: number };

  const employerBMobile = `0900000007${run}`;
  const employerB = await appContext.userStore.upsertUserByMobile(employerBMobile, "EMPLOYER", {
    is_active: true,
  });
  await workspaceRepo.upsertMembership({
    user_id: employerB.id,
    mine_id: 1,
    role_in_workspace: "EMPLOYER",
    status: "ACTIVE",
  });
  const employerBToken = await loginAs(employerBMobile);
  await selectMine(employerBToken, 1);

  const cancelForeign = await http(`/api/employer/needs/${otherNeed.id}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${employerBToken}` },
    body: JSON.stringify({ reason: "not my need" }),
  });
  assert(cancelForeign.status === 403, `run ${run}: other employer cancel must 403`);

  const opsCancel = await http(`/api/employer/needs/${otherNeed.id}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opsToken}` },
    body: JSON.stringify({ reason: `ops cancel run ${run}` }),
  });
  assert(opsCancel.status === 200, `run ${run}: ops cancel any need failed`);

  console.log(`EMP-PERM-1 run ${run}: OK (need #${need.id})`);
}

async function main() {
  BASE = await ensureTestHttpServer();
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  console.log("EMP-PERM-1: all 3 runs passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await closeTestHttpServer();
    await prisma.$disconnect();
  });
