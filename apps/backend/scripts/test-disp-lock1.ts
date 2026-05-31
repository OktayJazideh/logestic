/**
 * DISPATCH-LOCK-1: one active mission per driver/vehicle.
 * Run 3x: npm run test:disp-lock1
 * Requires: server on TEST_BASE_URL, db:migrate, db:seed.
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { ACTIVE_MISSION_STATUSES } from "../src/lib/missionFsm";
import { initAppContext } from "../src/lib/appInit";
import { toNum } from "../src/repositories/id";
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

async function createNeed(employerToken: string, tons: number, note: string) {
  const create = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({
      village_id: 1,
      material_type: "ORE",
      quantity_tons: tons,
      note,
    }),
  });
  assert(create.status === 201, `create need failed: ${JSON.stringify(create.json)}`);
  return create.json.data.need.id as number;
}

async function dispatchNeed(adminToken: string, needId: number) {
  return http(`/api/admin/needs/${needId}/dispatch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({}),
  });
}

/** Single driver + single vehicle — forces driver/vehicle lock on second need. */
async function ensureLockFleet(run: number) {
  await appContext.entities.hydrate();
  const fleetOwner = await appContext.entities.upsertFleetOwner({
    user_id: (await appContext.userStore.upsertUserByMobile(`0900000500${run}`, "FLEET_OWNER", { is_active: true }))
      .id,
    cooperative_id: 1,
    full_name: `مالک قفل dispatch ${run}`,
    national_id: `fleet-lock-${run}-${Date.now()}`,
    status: "APPROVED",
  });

  const driverA = await appContext.entities.upsertDriver({
    user_id: (await appContext.userStore.upsertUserByMobile(`0900000501${run}`, "DRIVER", { is_active: true })).id,
    cooperative_id: 1,
    full_name: `راننده قفل ${run}`,
    license_number: `LIC-LOCK-${run}`,
    status: "APPROVED",
  });

  const vehicle = await appContext.entities.upsertVehicle({
    owner_id: fleetOwner.id,
    cooperative_id: 1,
    license_plate: `IR-LOCK-${run}`,
    vehicle_type: "TRUCK",
    capacity_tons: 30,
    status: "APPROVED",
  });

  return { fleetOwner, driverA, vehicle };
}

/** Only our fleet may be dispatched; clear stale active missions on mine 1. */
async function isolateLockFleet(driverId: number, vehicleId: number) {
  await prisma.missions.updateMany({
    where: {
      status: { in: ACTIVE_MISSION_STATUSES },
      load: { mine_id: BigInt(1) },
    },
    data: { status: "SETTLED", payment_state: "SETTLED" },
  });

  const otherDrivers = await prisma.drivers.findMany({
    where: { cooperative_id: BigInt(1), status: "APPROVED", id: { not: BigInt(driverId) } },
    select: { id: true },
  });
  const otherVehicles = await prisma.vehicles.findMany({
    where: { cooperative_id: BigInt(1), status: "APPROVED", id: { not: BigInt(vehicleId) } },
    select: { id: true },
  });

  if (otherDrivers.length) {
    await prisma.drivers.updateMany({
      where: { id: { in: otherDrivers.map((d) => d.id) } },
      data: { status: "SUSPENDED" },
    });
  }
  if (otherVehicles.length) {
    await prisma.vehicles.updateMany({
      where: { id: { in: otherVehicles.map((v) => v.id) } },
      data: { status: "SUSPENDED" },
    });
  }

  return {
    driverIds: otherDrivers.map((d) => toNum(d.id)),
    vehicleIds: otherVehicles.map((v) => toNum(v.id)),
  };
}

async function restoreFleet(suspended: { driverIds: number[]; vehicleIds: number[] }) {
  if (suspended.driverIds.length) {
    await prisma.drivers.updateMany({
      where: { id: { in: suspended.driverIds.map((id) => BigInt(id)) } },
      data: { status: "APPROVED" },
    });
  }
  if (suspended.vehicleIds.length) {
    await prisma.vehicles.updateMany({
      where: { id: { in: suspended.vehicleIds.map((id) => BigInt(id)) } },
      data: { status: "APPROVED" },
    });
  }
}

async function runOnce(run: number) {
  clearEventsForTests();
  await initAppContext();
  const { driverA, vehicle } = await ensureLockFleet(run);
  const suspended = await isolateLockFleet(driverA.id, vehicle.id);

  try {
  const employerToken = await loginAs("09000000007");
  const adminToken = await loginAs("09000000000");
  await selectMine(employerToken, 1);

  const need1 = await createNeed(employerToken, 10, `disp-lock driver run ${run} #1`);
  const d1 = await dispatchNeed(adminToken, need1);
  assert(d1.status === 200 && d1.json.success, `run ${run}: need1 dispatch failed: ${JSON.stringify(d1.json)}`);

  const a1 = d1.json.data.assignments as { driver_id: number; vehicle_id: number; mission_id: number }[];
  assert(a1.length === 1, `run ${run}: need1 expected 1 mission`);
  assert(a1[0]!.driver_id === driverA.id, `run ${run}: expected driver A`);
  assert(a1[0]!.vehicle_id === vehicle.id, `run ${run}: expected lock vehicle`);
  const missionAId = a1[0]!.mission_id;

  const need2 = await createNeed(employerToken, 10, `disp-lock driver run ${run} #2`);
  const d2 = await dispatchNeed(adminToken, need2);
  assert(d2.status === 409, `run ${run}: need2 should 409, got ${d2.status}`);
  assert(d2.json.error?.code === "active_mission_exists", `run ${run}: bad error code`);
  const d2Details = d2.json.error?.details as { driver_id?: number; vehicle_id?: number } | undefined;
  assert(
    d2Details?.driver_id === driverA.id || d2Details?.vehicle_id === vehicle.id,
    `run ${run}: 409 details should name driver or vehicle`,
  );

  await prisma.missions.update({
    where: { id: BigInt(missionAId) },
    data: { status: "SETTLED", payment_state: "SETTLED" },
  });

  const need3 = await createNeed(employerToken, 10, `disp-lock driver run ${run} #3`);
  const d3 = await dispatchNeed(adminToken, need3);
  assert(d3.status === 200 && d3.json.success, `run ${run}: need3 after settle failed: ${JSON.stringify(d3.json)}`);
  const missionBId = (d3.json.data.assignments as { mission_id: number }[])[0]!.mission_id;
  await prisma.missions.update({
    where: { id: BigInt(missionBId) },
    data: { status: "SETTLED", payment_state: "SETTLED" },
  });

  const need4 = await createNeed(employerToken, 8, `disp-lock vehicle run ${run} #4`);
  const d4 = await dispatchNeed(adminToken, need4);
  assert(d4.status === 200 && d4.json.success, `run ${run}: need4 dispatch failed`);
  const v4 = (d4.json.data.assignments as { vehicle_id: number }[])[0]!.vehicle_id;

  const need5 = await createNeed(employerToken, 8, `disp-lock vehicle run ${run} #5`);
  const d5 = await dispatchNeed(adminToken, need5);
  assert(d5.status === 409, `run ${run}: need5 vehicle lock should 409`);
  assert(d5.json.error?.code === "active_mission_exists", `run ${run}: vehicle lock code`);
  const d5Details = d5.json.error?.details as { driver_id?: number; vehicle_id?: number } | undefined;
  assert(
    d5Details?.vehicle_id === v4 || d5Details?.driver_id === driverA.id,
    `run ${run}: 409 should name busy vehicle or driver`,
  );

  console.log(`DISPATCH-LOCK-1 run ${run}: OK (driver ${driverA.id}, vehicle ${vehicle.id})`);
  } finally {
    await prisma.missions.updateMany({
      where: {
        status: { in: ACTIVE_MISSION_STATUSES },
        load: { mine_id: BigInt(1) },
      },
      data: { status: "SETTLED", payment_state: "SETTLED" },
    });
    await restoreFleet(suspended);
  }
}

async function main() {
  BASE = await ensureTestHttpServer();
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  console.log("DISPATCH-LOCK-1: all 3 runs passed");
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
