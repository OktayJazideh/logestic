/**
 * CORE-OS-2: dispatch strategy registry (HAUL_TONNAGE + HOURLY_EQUIPMENT stub).
 * Run 3x: npm run test:core-os2
 * Requires: db:migrate, db:seed. Uses TEST_BASE_URL or boots ephemeral server on 127.0.0.1.
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { clearEventsForTests } from "../src/services/eventBus";
import { resolveStrategy } from "../src/services/dispatch/dispatchRegistry";
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

async function ensureDispatchFleet(run: number) {
  await appContext.entities.hydrate();
  const fleetOwner = await appContext.entities.upsertFleetOwner({
    user_id: (await appContext.userStore.upsertUserByMobile(`0900000500${run}`, "FLEET_OWNER", { is_active: true }))
      .id,
    cooperative_id: 1,
    full_name: `مالک ناوگان CORE-OS2 ${run}`,
    national_id: `fleet-os2-${run}-${Date.now()}`,
    status: "APPROVED",
  });

  await appContext.entities.upsertDriver({
    user_id: (await appContext.userStore.upsertUserByMobile(`0900000501${run}`, "DRIVER", { is_active: true })).id,
    cooperative_id: 1,
    full_name: `راننده A OS2 ${run}`,
    license_number: `LIC-OS2-A-${run}`,
    status: "APPROVED",
  });

  await appContext.entities.upsertDriver({
    user_id: (await appContext.userStore.upsertUserByMobile(`0900000502${run}`, "DRIVER", { is_active: true })).id,
    cooperative_id: 1,
    full_name: `راننده B OS2 ${run}`,
    license_number: `LIC-OS2-B-${run}`,
    status: "APPROVED",
  });

  await appContext.entities.upsertVehicle({
    owner_id: fleetOwner.id,
    cooperative_id: 1,
    license_plate: `IR-OS2-${run}-01`,
    vehicle_type: "TRUCK",
    capacity_tons: 20,
    status: "APPROVED",
  });

  await appContext.entities.upsertVehicle({
    owner_id: fleetOwner.id,
    cooperative_id: 1,
    license_plate: `IR-OS2-${run}-02`,
    vehicle_type: "TRUCK",
    capacity_tons: 20,
    status: "APPROVED",
  });
}

async function runOnce(run: number) {
  clearEventsForTests();
  await initAppContext();
  await ensureDispatchFleet(run);

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

  const create = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({
      village_id: 1,
      material_type: `CORE_OS2_HAUL_${run}`,
      quantity_tons: 30,
      operation_type_id: haul!.id,
      note: `core-os2 haul run ${run}`,
    }),
  });
  assert(create.status === 201 && create.json.success, `run ${run}: create haul need failed: ${JSON.stringify(create.json)}`);
  const needId = create.json.data.need.id as number;
  assert(create.json.data.need.operation_type_id === haul!.id, `run ${run}: operation_type_id not stored`);

  const dispatch = await http(`/api/admin/needs/${needId}/dispatch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({}),
  });
  assert(dispatch.status === 200 && dispatch.json.success, `run ${run}: dispatch failed: ${JSON.stringify(dispatch.json)}`);

  const data = dispatch.json.data;
  assert(data.need.status === "DISPATCHED", `run ${run}: need not DISPATCHED`);
  const assignments = data.assignments as {
    mission_id: number;
    load_id: number;
    quantity_tons: number;
    vehicle_id: number;
    driver_id: number;
    owner_id: number;
  }[];
  assert(assignments.length === 2, `run ${run}: expected 2 assignments, got ${assignments.length}`);
  for (const a of assignments) {
    assert(a.mission_id > 0 && a.load_id > 0, `run ${run}: mission/load ids missing`);
    assert(a.vehicle_id > 0 && a.driver_id > 0 && a.owner_id > 0, `run ${run}: fleet ids missing`);
  }
  const tons = assignments.map((a) => a.quantity_tons).sort((a, b) => b - a);
  assert(tons[0] === 20 && tons[1] === 10, `run ${run}: expected 20+10 tons, got ${tons.join("+")}`);

  const events = data.events as string[];
  assert(events.includes("mission.created") && events.includes("mission.assigned"), `run ${run}: events missing`);

  const invalidNeed = await http("/api/admin/needs/999999999/dispatch", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({}),
  });
  assert(invalidNeed.status === 404, `run ${run}: invalid need id should 404, got ${invalidNeed.status}`);

  const hourlyNeed = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({
      village_id: 1,
      operation_type_id: hourly!.id,
      equipment_type: `EXCAVATOR_CORE_OS2_${run}`,
      location_text: `Site run ${run}`,
    }),
  });
  assert(hourlyNeed.status === 201, `run ${run}: hourly need create failed`);
  const hourlyId = hourlyNeed.json.data.need.id as number;

  const hourlyDispatch = await http(`/api/admin/needs/${hourlyId}/dispatch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({}),
  });
  assert(
    hourlyDispatch.status === 501,
    `run ${run}: hourly dispatch should 501, got ${hourlyDispatch.status}`,
  );
  assert(
    String(hourlyDispatch.json?.error?.message ?? hourlyDispatch.json?.message ?? "").includes("HOURLY-APP-1"),
    `run ${run}: hourly message should mention HOURLY-APP-1`,
  );

  const manualForbidden = await http(`/api/admin/needs/${needId}/dispatch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ driver_id: 1 }),
  });
  assert(manualForbidden.status === 400, `run ${run}: manual driver body should 400`);

  // eslint-disable-next-line no-console
  console.log(`run ${run} CORE-OS-2 OK — need #${needId}, assignments=${assignments.length} (${tons[0]}+${tons[1]}t)`);
}

async function testRegistryUnit() {
  assert(resolveStrategy("HAUL_TONNAGE").code === "HAUL_TONNAGE", "haul strategy missing");
  assert(resolveStrategy("HOURLY_EQUIPMENT").code === "HOURLY_EQUIPMENT", "hourly strategy missing");
  let threw = false;
  try {
    resolveStrategy("UNKNOWN_TYPE_X");
  } catch {
    threw = true;
  }
  assert(threw, "unknown operation type should throw from resolveStrategy");

  const hourly = resolveStrategy("HOURLY_EQUIPMENT");
  const stub = await hourly.dispatch(
    {
      id: 0,
      mine_id: 1,
      employer_user_id: 1,
      village_id: 1,
      material_type: "X",
      quantity_tons: 1,
      operation_type: "HOURLY",
      operation_type_id: "x",
      status: "PENDING",
      created_at: new Date(),
      operationType: { code: "HOURLY_EQUIPMENT" },
    },
    { needId: 0, dispatchedByUserId: 1, auditStore: appContext.auditStore },
  );
  assert(!stub.ok && stub.statusCode === 501, "hourly stub should return 501");
}

async function main() {
  BASE = await ensureTestHttpServer();
  await testRegistryUnit();
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  // eslint-disable-next-line no-console
  console.log("CORE-OS-2 all runs PASS");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeTestHttpServer();
    await prisma.$disconnect();
  });
