/**
 * EMP-1: employer operation needs API tests.
 * Run 3x: npm run test:emp1
 * Requires: server on TEST_BASE_URL, db:migrate, db:seed.
 */
import "dotenv/config";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { prisma } from "../src/db/prisma";
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

  const employerToken = await loginAs("09000000007");
  const opsToken = await loginAs("09000000002");
  const driverToken = await loginAs("09000000003");

  const forbidden = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({
      village_id: 1,
      material_type: "ORE",
      quantity_tons: 10,
    }),
  });
  assert(forbidden.status === 403, `run ${run}: driver should be forbidden on POST`);

  await selectMine(employerToken, 1);

  const noMine = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${opsToken}` },
    body: JSON.stringify({
      village_id: 1,
      material_type: "ORE",
      quantity_tons: 5,
    }),
  });
  assert(noMine.status === 403, `run ${run}: ops admin should not POST needs`);

  const badVillage = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({
      village_id: 3,
      material_type: "ORE",
      quantity_tons: 12,
    }),
  });
  assert(badVillage.status === 400, `run ${run}: village 3 not in mine 1`);

  const qty = 10 + run;
  const create = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({
      village_id: 1,
      material_type: "ORE",
      quantity_tons: qty,
      note: `test run ${run}`,
    }),
  });
  assert(create.status === 201 && create.json.success, `run ${run}: create failed: ${JSON.stringify(create.json)}`);
  const need = create.json.data.need;
  assert(need.status === "PENDING", `run ${run}: expected PENDING`);
  assert(need.mine_id === 1, `run ${run}: mine_id mismatch`);
  assert(need.quantity_tons === qty, `run ${run}: quantity mismatch`);

  const listEmployer = await http("/api/employer/needs", {
    headers: { Authorization: `Bearer ${employerToken}` },
  });
  assert(listEmployer.status === 200, `run ${run}: employer list failed`);
  const own = listEmployer.json.data.needs as { id: number }[];
  assert(own.some((n) => n.id === need.id), `run ${run}: created need not in employer list`);

  const listOps = await http("/api/employer/needs", {
    headers: { Authorization: `Bearer ${opsToken}` },
  });
  assert(listOps.status === 200, `run ${run}: ops list failed`);
  const all = listOps.json.data.needs as { id: number }[];
  assert(all.some((n) => n.id === need.id), `run ${run}: created need not in ops list`);

  const cancelBad = await http(`/api/employer/needs/${need.id}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({ reason: "ab" }),
  });
  assert(cancelBad.status === 400, `run ${run}: short reason should fail`);

  const cancel = await http(`/api/employer/needs/${need.id}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({ reason: `cancel test run ${run}` }),
  });
  assert(cancel.status === 200 && cancel.json.data.need.status === "CANCELLED", `run ${run}: cancel failed`);

  const cancelAgain = await http(`/api/employer/needs/${need.id}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({ reason: "duplicate cancel" }),
  });
  assert(cancelAgain.status === 409, `run ${run}: double cancel should 409`);

  console.log(`EMP-1 run ${run}: OK (need #${need.id})`);
}

async function main() {
  BASE = await ensureTestHttpServer();
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  console.log("EMP-1: all 3 runs passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeTestHttpServer();
    await prisma.$disconnect();
  });
