/**
 * TENANT-1: multi-tenant workspace isolation (3 cross-mine scenarios).
 * Run: npm run test:tenant1
 * Requires: db:migrate, db:seed (or embedded upsert in runOnce).
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import * as workspaceRepo from "../src/repositories/workspaceMembershipsRepository";

let testServer: Server | null = null;
let baseUrl = "";

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

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function selectWorkspace(token: string, mineId: number) {
  const r = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: mineId, membership_kind: "OPERATIONAL" }),
  });
  return r;
}

async function runOnce(run: number) {
  await appContext.mineData.hydrate();

  const driverUser = await appContext.userStore.upsertUserByMobile("09000000003", "DRIVER", { is_active: true });
  await workspaceRepo.upsertMembership({
    user_id: driverUser.id,
    mine_id: 1,
    cooperative_id: 1,
    role_in_workspace: "DRIVER",
    status: "ACTIVE",
  });

  const driverToken = await loginAs("09000000003");

  const denyMine2 = await selectWorkspace(driverToken, 2);
  assert(
    denyMine2.status === 403 && denyMine2.json?.error?.code === "workspace_access_denied",
    `run ${run}: driver must not select mine 2`,
  );

  const noMineCtx = await http("/api/driver/missions", {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  assert(
    noMineCtx.status === 400 && noMineCtx.json?.error?.code === "mine_not_selected",
    `run ${run}: driver missions without workspace should be 400`,
  );

  const allowMine1 = await selectWorkspace(driverToken, 1);
  assert(allowMine1.status === 200 && allowMine1.json.success, `run ${run}: driver select mine 1 failed`);

  const missionsMine1 = await http("/api/driver/missions", {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  assert(missionsMine1.status === 200, `run ${run}: driver missions with mine 1 context failed`);

  const employerToken = await loginAs("09000000007");
  await selectWorkspace(employerToken, 1);

  const crossVillage = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({
      village_id: 3,
      material_type: "ORE",
      quantity_tons: 4,
    }),
  });
  assert(
    crossVillage.status === 400 && crossVillage.json?.error?.code === "village_not_in_mine",
    `run ${run}: employer must not create need in mine B village while on mine A`,
  );

  const adminToken = await loginAs(process.env.SEED_ADMIN_MOBILE?.trim() || "09000000000");
  const onboardSlug = `TENANT1-${Date.now().toString(36).toUpperCase()}-${run}`;
  const onboard = await http("/api/admin/mines/onboard", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: `معدن تست tenant ${run}`,
      slug: onboardSlug,
      platform_fee: 0.01,
      community_rial_per_ton: 300_000,
      geofence: { lat: 30.1, lng: 58.1, radius_m: 400 },
    }),
  });
  assert(onboard.status === 201 && onboard.json.success, `run ${run}: admin onboard failed`);
  const newMineId = onboard.json.data.onboard.mine_id as number;

  const driverDenyNew = await selectWorkspace(driverToken, newMineId);
  assert(
    driverDenyNew.status === 403 && driverDenyNew.json?.error?.code === "workspace_access_denied",
    `run ${run}: driver must not select onboarded mine without membership`,
  );

  const adminSelectNew = await selectWorkspace(adminToken, newMineId);
  assert(adminSelectNew.status === 200 && adminSelectNew.json.success, `run ${run}: admin select onboarded mine failed`);

  // eslint-disable-next-line no-console
  console.log(`TENANT-1 run ${run} OK (onboard mine #${newMineId})`);
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  // eslint-disable-next-line no-console
  console.log("TENANT-1: all 3 cross-mine scenarios passed");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    if (testServer) {
      testServer.close();
    }
  });
