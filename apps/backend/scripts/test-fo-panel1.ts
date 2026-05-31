/**
 * FO-PANEL-1: fleet owner dashboard API — scoped summary/vehicles/missions.
 * Run 3x: npm run test:fo-panel1
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import * as workspaceRepo from "../src/repositories/workspaceMembershipsRepository";
import { prisma } from "../src/db/prisma";

let testServer: Server | null = null;
let baseUrl = "";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function ensureTestServer(): Promise<string> {
  if (baseUrl) return baseUrl;
  await initAppContext();
  const app = createApp();
  return new Promise((resolve, reject) => {
    testServer = createServer(app);
    testServer.listen(0, "127.0.0.1", () => {
      const addr = testServer!.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Could not bind test server"));
        return;
      }
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve(baseUrl);
    });
    testServer.on("error", reject);
  });
}

async function http(path: string, init?: RequestInit) {
  const root = await ensureTestServer();
  const res = await fetch(`${root}${path}`, {
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

async function selectWorkspace(token: string, mineId: number) {
  const r = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: mineId }),
  });
  assert(r.status === 200 && r.json.success, `workspace select failed: ${JSON.stringify(r.json)}`);
}

async function seedDemoMission(adminToken: string, mineId: number) {
  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: mineId, quantity_tons: 5, material_type: "ORE" }),
  });
  assert(seed.status === 200 && seed.json.success, `seed failed: ${JSON.stringify(seed.json)}`);
  return seed.json.data as {
    mission: { id: number };
    entities: { fleetOwner: { id: number; mobile: string } };
  };
}

async function runOnce(run: number) {
  await appContext.mineData.hydrate();
  await appContext.entities.hydrate();

  const adminToken = await loginAs("09000000000");
  const seeded = await seedDemoMission(adminToken, 1);
  const primaryOwnerMobile = seeded.entities.fleetOwner.mobile;
  const primaryOwnerId = seeded.entities.fleetOwner.id;

  const foToken = await loginAs(primaryOwnerMobile);
  await selectWorkspace(foToken, 1);

  const summary = await http("/api/fleet-owner/summary", {
    headers: { Authorization: `Bearer ${foToken}` },
  });
  assert(summary.status === 200 && summary.json.success, `run ${run}: summary failed ${JSON.stringify(summary.json)}`);
  const s = summary.json.data as Record<string, number>;
  assert(typeof s.verified_missions_count === "number", `run ${run}: summary shape`);
  assert(typeof s.wallet_balance_rial === "number", `run ${run}: wallet_balance missing`);

  const vehicles = await http("/api/fleet-owner/vehicles", {
    headers: { Authorization: `Bearer ${foToken}` },
  });
  assert(vehicles.status === 200 && vehicles.json.success, `run ${run}: vehicles failed`);
  assert(Array.isArray(vehicles.json.data), `run ${run}: vehicles not array`);
  assert(vehicles.json.data.length >= 1, `run ${run}: expected at least one vehicle`);

  const missions = await http("/api/fleet-owner/missions?limit=20", {
    headers: { Authorization: `Bearer ${foToken}` },
  });
  assert(missions.status === 200 && missions.json.success, `run ${run}: missions failed`);
  const missionRows = missions.json.data as Array<{ mission_id: number; owner_amount_rial: number }>;
  assert(missionRows.some((m) => m.mission_id === seeded.mission.id), `run ${run}: seeded mission missing`);

  const noAuth = await http("/api/fleet-owner/summary");
  assert(noAuth.status === 401, `run ${run}: unauthenticated must be 401`);

  const driverToken = await loginAs("09000000003");
  await selectWorkspace(driverToken, 1);
  for (const path of ["/api/fleet-owner/summary", "/api/fleet-owner/vehicles", "/api/fleet-owner/missions"]) {
    const denied = await http(path, { headers: { Authorization: `Bearer ${driverToken}` } });
    assert(denied.status === 403, `run ${run}: DRIVER must get 403 on ${path}, got ${denied.status}`);
  }

  const otherMobile = `09000005${run}99`;
  const otherUser = await appContext.userStore.upsertUserByMobile(otherMobile, "FLEET_OWNER", { is_active: true });
  const otherOwner = await appContext.entities.upsertFleetOwner({
    user_id: otherUser.id,
    cooperative_id: 1,
    full_name: `مالک دیگر ${run}`,
    national_id: `FO-OTHER-${run}-${Date.now()}`,
    status: "APPROVED",
  });
  await workspaceRepo.upsertMembership({
    user_id: otherUser.id,
    mine_id: 1,
    cooperative_id: 1,
    role_in_workspace: "FLEET_OWNER",
    status: "ACTIVE",
  });

  const otherToken = await loginAs(otherMobile);
  await selectWorkspace(otherToken, 1);

  const crossSummary = await http("/api/fleet-owner/summary", {
    headers: { Authorization: `Bearer ${otherToken}` },
  });
  assert(crossSummary.status === 200 && crossSummary.json.success, `run ${run}: other owner summary failed`);
  const cs = crossSummary.json.data as { verified_missions_count: number; missions_in_progress: number };
  assert(
    cs.verified_missions_count === 0 && cs.missions_in_progress === 0,
    `run ${run}: cross owner must see zero missions, got ${JSON.stringify(cs)}`,
  );

  const crossMissions = await http("/api/fleet-owner/missions", {
    headers: { Authorization: `Bearer ${otherToken}` },
  });
  assert(crossMissions.status === 200, `run ${run}: cross missions status`);
  const crossRows = crossMissions.json.data as Array<{ mission_id: number }>;
  assert(
    !crossRows.some((m) => m.mission_id === seeded.mission.id),
    `run ${run}: other owner must not see primary mission ${seeded.mission.id}`,
  );

  assert(otherOwner.id !== primaryOwnerId, `run ${run}: owner ids must differ`);
}

async function main() {
  for (let run = 1; run <= 3; run += 1) {
    await runOnce(run);
    // eslint-disable-next-line no-console
    console.log(`FO-PANEL-1 run ${run}/3 OK`);
  }
  // eslint-disable-next-line no-console
  console.log("FO-PANEL-1 all runs PASS");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (testServer) {
      await new Promise<void>((resolve, reject) => testServer!.close((err) => (err ? reject(err) : resolve())));
    }
    await prisma.$disconnect();
  });
