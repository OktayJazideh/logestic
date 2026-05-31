/**
 * NEED-HOURLY-1: hourly operation need API + haul regression.
 * Run 3x: npm run test:need-hourly1
 * Requires: server on TEST_BASE_URL, db:migrate (0044), db:seed.
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
  await appContext.userStore.upsertUserByMobile("09000000000", "ADMIN", { is_active: true });

  const employerToken = await loginAs("09000000007");
  const adminToken = await loginAs("09000000000");
  await selectMine(employerToken, 1);

  const types = await http("/api/operation-types", {
    headers: { Authorization: `Bearer ${employerToken}` },
  });
  assert(types.status === 200 && types.json.success, `run ${run}: operation-types failed`);
  const haul = (types.json.data?.items as Array<{ id: string; code: string }>).find((t) => t.code === "HAUL_TONNAGE");
  const hourly = (types.json.data?.items as Array<{ id: string; code: string }>).find(
    (t) => t.code === "HOURLY_EQUIPMENT",
  );
  assert(!!haul?.id, `run ${run}: HAUL_TONNAGE missing`);
  assert(!!hourly?.id, `run ${run}: HOURLY_EQUIPMENT missing`);

  const hourlyMissingFields = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({
      village_id: 1,
      operation_type_id: hourly!.id,
    }),
  });
  assert(hourlyMissingFields.status === 400, `run ${run}: hourly without fields should 400`);

  const hourlyWithTons = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({
      village_id: 1,
      operation_type_id: hourly!.id,
      equipment_type: "EXCAVATOR",
      location_text: "Site north",
      quantity_tons: 5,
    }),
  });
  assert(hourlyWithTons.status === 400, `run ${run}: hourly with quantity_tons should 400`);

  const hourlyCreate = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({
      village_id: 1,
      operation_type_id: hourly!.id,
      equipment_type: `EXCAVATOR_${run}`,
      location_text: `North pit run ${run}`,
      estimated_hours: 6 + run,
      note: `hourly need run ${run}`,
    }),
  });
  assert(
    hourlyCreate.status === 201 && hourlyCreate.json.success,
    `run ${run}: hourly create failed: ${JSON.stringify(hourlyCreate.json)}`,
  );
  const hourlyNeed = hourlyCreate.json.data.need;
  assert(hourlyNeed.status === "PENDING", `run ${run}: hourly need should be PENDING`);
  assert(hourlyNeed.operation_type_id === hourly!.id, `run ${run}: hourly operation_type_id mismatch`);
  assert(hourlyNeed.operation_type_code === "HOURLY_EQUIPMENT", `run ${run}: hourly operation_type_code`);
  assert(hourlyNeed.quantity_tons == null, `run ${run}: hourly quantity_tons should be null`);
  assert(hourlyNeed.equipment_type === `EXCAVATOR_${run}`, `run ${run}: equipment_type mismatch`);
  assert(hourlyNeed.location_text === `North pit run ${run}`, `run ${run}: location_text mismatch`);
  assert(hourlyNeed.estimated_hours === 6 + run, `run ${run}: estimated_hours mismatch`);

  const hourlyDispatch = await http(`/api/admin/needs/${hourlyNeed.id}/dispatch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({}),
  });
  assert(hourlyDispatch.status === 501, `run ${run}: hourly dispatch should 501 via hourlyDispatchStrategy`);
  assert(
    String(hourlyDispatch.json?.error?.message ?? hourlyDispatch.json?.message ?? "").includes("HOURLY-APP-1"),
    `run ${run}: hourly dispatch message should mention HOURLY-APP-1`,
  );

  const haulQty = 12 + run;
  const haulCreate = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({
      village_id: 1,
      material_type: "ORE",
      quantity_tons: haulQty,
      operation_type_id: haul!.id,
      note: `haul regression run ${run}`,
    }),
  });
  assert(
    haulCreate.status === 201 && haulCreate.json.success,
    `run ${run}: haul create failed: ${JSON.stringify(haulCreate.json)}`,
  );
  const haulNeed = haulCreate.json.data.need;
  assert(haulNeed.status === "PENDING", `run ${run}: haul need should be PENDING`);
  assert(haulNeed.quantity_tons === haulQty, `run ${run}: haul quantity mismatch`);
  assert(haulNeed.operation_type_id === haul!.id, `run ${run}: haul operation_type_id mismatch`);

  console.log(`NEED-HOURLY-1 run ${run}: OK (hourly #${hourlyNeed.id}, haul #${haulNeed.id})`);
}

async function main() {
  BASE = await ensureTestHttpServer();
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  console.log("NEED-HOURLY-1: all 3 runs passed");
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
