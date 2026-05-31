/**
 * DISP-1: system dispatch engine tests.
 * Run 3x: npm run test:disp1
 * Requires: server on TEST_BASE_URL, db:migrate, db:seed.
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { ACTIVE_MISSION_STATUSES } from "../src/lib/missionFsm";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { clearEventsForTests } from "../src/services/eventBus";
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
    user_id: (await appContext.userStore.upsertUserByMobile(`0900000400${run}`, "FLEET_OWNER", { is_active: true }))
      .id,
    cooperative_id: 1,
    full_name: `مالک ناوگان تست ${run}`,
    national_id: `fleet-disp-${run}-${Date.now()}`,
    status: "APPROVED",
  });

  const driverA = await appContext.entities.upsertDriver({
    user_id: (await appContext.userStore.upsertUserByMobile(`0900000401${run}`, "DRIVER", { is_active: true })).id,
    cooperative_id: 1,
    full_name: `راننده A تست ${run}`,
    license_number: `LIC-A-${run}`,
    status: "APPROVED",
  });

  const driverB = await appContext.entities.upsertDriver({
    user_id: (await appContext.userStore.upsertUserByMobile(`0900000402${run}`, "DRIVER", { is_active: true })).id,
    cooperative_id: 1,
    full_name: `راننده B تست ${run}`,
    license_number: `LIC-B-${run}`,
    status: "APPROVED",
  });

  const plate1 = `IR-DISP-${run}-01`;
  const plate2 = `IR-DISP-${run}-02`;

  await appContext.entities.upsertVehicle({
    owner_id: fleetOwner.id,
    cooperative_id: 1,
    license_plate: plate1,
    vehicle_type: "TRUCK",
    capacity_tons: 20,
    status: "APPROVED",
  });

  await appContext.entities.upsertVehicle({
    owner_id: fleetOwner.id,
    cooperative_id: 1,
    license_plate: plate2,
    vehicle_type: "TRUCK",
    capacity_tons: 20,
    status: "APPROVED",
  });

  return { fleetOwner, driverA, driverB };
}

async function runOnce(run: number) {
  clearEventsForTests();
  await initAppContext();
  await prisma.missions.updateMany({
    where: {
      status: { in: ACTIVE_MISSION_STATUSES },
      load: { mine_id: BigInt(1) },
    },
    data: { status: "SETTLED", payment_state: "SETTLED" },
  });
  await ensureDispatchFleet(run);

  const employerToken = await loginAs("09000000007");
  const adminToken = await loginAs("09000000000");
  const opsToken = await loginAs("09000000002");

  await selectMine(employerToken, 1);

  const create = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({
      village_id: 1,
      material_type: "ORE",
      quantity_tons: 30,
      note: `disp test run ${run}`,
    }),
  });
  assert(create.status === 201, `run ${run}: create need failed: ${JSON.stringify(create.json)}`);
  const needId = create.json.data.need.id as number;
  assert(create.json.data.need.status === "PENDING", `run ${run}: need should stay PENDING in manual mode`);

  const forbiddenBody = await http(`/api/admin/needs/${needId}/dispatch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ driver_id: 1 }),
  });
  assert(
    forbiddenBody.status === 400,
    `run ${run}: manual driver selection must be rejected`,
  );

  const dispatch = await http(`/api/admin/needs/${needId}/dispatch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({}),
  });
  assert(dispatch.status === 200 && dispatch.json.success, `run ${run}: dispatch failed: ${JSON.stringify(dispatch.json)}`);

  const data = dispatch.json.data;
  assert(data.need.status === "DISPATCHED", `run ${run}: need not DISPATCHED`);
  const assignments = data.assignments as { quantity_tons: number }[];
  assert(assignments.length === 2, `run ${run}: expected 2 missions, got ${assignments.length}`);
  const tons = assignments.map((a) => a.quantity_tons).sort((a, b) => b - a);
  assert(tons[0] === 20 && tons[1] === 10, `run ${run}: expected 20+10 tons, got ${tons.join("+")}`);

  const events = data.events as string[];
  assert(events.includes("mission.created"), `run ${run}: missing mission.created`);
  assert(events.includes("mission.assigned"), `run ${run}: missing mission.assigned`);

  const ws = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${opsToken}` },
    body: JSON.stringify({ mine_id: 1, membership_kind: "OPERATIONAL" }),
  });
  assert(ws.status === 200 && ws.json.success, `run ${run}: ops workspace select failed`);

  const driverForbidden = await http(`/api/admin/needs/${needId}/dispatch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opsToken}` },
    body: JSON.stringify({}),
  });
  assert(driverForbidden.status === 409, `run ${run}: double dispatch should 409, got ${driverForbidden.status}`);

  const missionCount = await prisma.missions.count({
    where: { load: { mine_id: BigInt(1) } },
  });
  assert(missionCount >= 2, `run ${run}: missions not persisted`);

  console.log(`DISP-1 run ${run}: OK (need #${needId}, missions ${tons[0]}+${tons[1]}t)`);
}

async function main() {
  BASE = await ensureTestHttpServer();
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  console.log("DISP-1: all 3 runs passed");
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
