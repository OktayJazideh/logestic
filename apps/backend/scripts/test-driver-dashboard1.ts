/**
 * WF-DASH-1: driver dashboard API contract — backend ↔ mobile driver home.
 * Asserts GET /api/driver/dashboard shape matches DriverDashboard.fromJson.
 * Run 3x: npm run test:driver-dashboard1
 */
import "dotenv/config";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import {
  ensureTestHttpServer,
  runIntegrationScript,
  testFetch as http,
} from "./lib/testHttpServer";

const DRIVER_MOBILE = "09000000003";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
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

async function selectMine(token: string, mineId: number) {
  const r = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: mineId, membership_kind: "OPERATIONAL" }),
  });
  if (r.status !== 200 || !r.json.success) {
    throw new Error(`workspace select failed: ${JSON.stringify(r.json)}`);
  }
}

async function seedMission(adminToken: string, run: number) {
  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: 1, quantity_tons: 20 + run, material_type: "ORE" }),
  });
  if (seed.status !== 200 || !seed.json.success) {
    throw new Error(`devSeed failed: ${JSON.stringify(seed.json)}`);
  }
  return seed.json.data.mission.id as number;
}

function assertDashboardContract(data: Record<string, unknown>, run: number, driverId: number) {
  assert(typeof data.state === "string", `run ${run}: state required`);
  assert(["IDLE", "ACTIVE", "AWAITING_WB"].includes(data.state as string), `run ${run}: invalid state`);

  const driver = data.driver as Record<string, unknown>;
  assert(driver != null, `run ${run}: driver required`);
  assert(typeof driver.full_name === "string" && driver.full_name.length > 0, `run ${run}: full_name`);
  assert(driver.driver_code === `DRV-${driverId}`, `run ${run}: driver_code must be DRV-${driverId}`);

  const summary = data.summary as Record<string, unknown>;
  assert(summary != null, `run ${run}: summary required`);
  for (const key of ["today_trips", "today_deliveries", "today_km", "pending_settlement"]) {
    assert(typeof summary[key] === "number", `run ${run}: summary.${key} must be number`);
  }
  assert((summary.today_km as number) >= 0, `run ${run}: today_km >= 0`);

  if (data.active_mission != null) {
    const m = data.active_mission as Record<string, unknown>;
    for (const key of ["id", "status", "origin", "destination", "material_type"]) {
      assert(m[key] != null, `run ${run}: active_mission.${key} required`);
    }
  }

  assert(Array.isArray(data.recent_history), `run ${run}: recent_history array`);
}

function assertMissionContract(m: Record<string, unknown>, run: number) {
  for (const key of [
    "id",
    "load_id",
    "mine_id",
    "owner_id",
    "driver_id",
    "vehicle_id",
    "status",
  ]) {
    assert(m[key] != null, `run ${run}: mission.${key} required for mobile DriverMission.fromJson`);
  }
  assert(typeof m.origin === "string", `run ${run}: mission.origin string`);
  assert(typeof m.destination === "string", `run ${run}: mission.destination string`);
}

async function runOnce(run: number) {
  await ensureTestHttpServer();
  await initAppContext();

  const driverUser = await appContext.userStore.getByMobile(DRIVER_MOBILE);
  assert(driverUser != null, `run ${run}: seed driver ${DRIVER_MOBILE} missing — run npm run db:seed`);
  const driver = appContext.entities.findDriverByUserId(driverUser.id);
  assert(driver != null && driver.status === "APPROVED", `run ${run}: approved driver row missing`);

  const driverToken = await loginAs(DRIVER_MOBILE);

  const noMine = await http("/api/driver/dashboard", {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  assert(noMine.status === 400, `run ${run}: dashboard without mine must be 400, got ${noMine.status}`);
  assert(noMine.json.error?.code === "mine_not_selected", `run ${run}: mine_not_selected`);

  await selectMine(driverToken, 1);

  const idleDash = await http("/api/driver/dashboard", {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  assert(idleDash.status === 200 && idleDash.json.success, `run ${run}: idle dashboard failed`);
  assertDashboardContract(idleDash.json.data, run, driver.id);

  const adminToken = await loginAs("09000000000");
  await selectMine(adminToken, 1);
  const missionId = await seedMission(adminToken, run);

  const activeDash = await http("/api/driver/dashboard", {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  assert(activeDash.status === 200 && activeDash.json.success, `run ${run}: active dashboard failed`);
  const dashData = activeDash.json.data as Record<string, unknown>;
  assertDashboardContract(dashData, run, driver.id);
  assert(dashData.state === "ACTIVE", `run ${run}: expected ACTIVE after seed, got ${dashData.state}`);
  const active = dashData.active_mission as Record<string, unknown>;
  assert(active.id === missionId, `run ${run}: active mission id mismatch`);

  const missions = await http("/api/driver/missions", {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  assert(missions.status === 200 && missions.json.success, `run ${run}: missions list failed`);
  const list = missions.json.data.missions as Record<string, unknown>[];
  assert(list.some((m) => m.id === missionId), `run ${run}: seeded mission in list`);
  const hit = list.find((m) => m.id === missionId)!;
  assertMissionContract(hit, run);

  const detail = await http(`/api/driver/missions/${missionId}`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  assert(detail.status === 200 && detail.json.success, `run ${run}: mission detail failed`);
  assertMissionContract(detail.json.data.mission, run);

  const geofence = await http(`/api/driver/missions/${missionId}/geofence?target=mine`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  assert(geofence.status === 200 && geofence.json.success, `run ${run}: geofence failed`);
  const gf = geofence.json.data.geofence as Record<string, unknown>;
  for (const key of ["target", "lat", "lng", "radius_m", "label"]) {
    assert(gf[key] != null, `run ${run}: geofence.${key} required for mobile GeofenceConfig`);
  }

  console.log(`run ${run}: WF-DASH-1 OK (mission ${missionId}, driver DRV-${driver.id})`);
}

async function main() {
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  console.log("WF-DASH-1 driver dashboard contract: 3/3 passed");
}

runIntegrationScript(main);
