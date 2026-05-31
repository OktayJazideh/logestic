/**
 * WS-DUAL-ROLE-1: Community vs operational workspace isolation.
 * Run 3x: npm run test:dual-role1
 * Requires: server on TEST_BASE_URL or embedded (initAppContext), db:migrate, db:seed.
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import * as workspaceRepo from "../src/repositories/workspaceMembershipsRepository";
import * as householdsRepo from "../src/repositories/householdsRepository";
import * as walletsRepo from "../src/repositories/walletsRepository";
import { prisma } from "../src/db/prisma";

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

async function selectWorkspace(
  token: string,
  body: { mine_id: number; cooperative_id?: number; membership_kind?: string },
) {
  return http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

async function runOnce(run: number) {
  await appContext.mineData.hydrate();
  await appContext.entities.hydrate();

  const dualMobile = "09000001999";
  const dualUser = await appContext.userStore.upsertUserByMobile(dualMobile, "HOUSEHOLD", { is_active: true });

  await workspaceRepo.upsertMembership({
    user_id: dualUser.id,
    mine_id: 1,
    cooperative_id: 1,
    role_in_workspace: "HOUSEHOLD",
    status: "ACTIVE",
  });
  await workspaceRepo.upsertMembership({
    user_id: dualUser.id,
    mine_id: 2,
    cooperative_id: 2,
    role_in_workspace: "FLEET_OWNER",
    status: "ACTIVE",
  });

  const hh = await householdsRepo.upsertHousehold({
    user_id: dualUser.id,
    village_id: 1,
    cooperative_id: 1,
    head_name: "خانوار دو نقشه",
    national_id: "9999999991",
    status: "APPROVED",
  });
  await prisma.$transaction(async (tx) => {
    await walletsRepo.findOrCreateHouseholdWallet(hh.id, tx);
  });

  const token = await loginAs(dualMobile);

  const wsList = await http("/api/workspaces", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(wsList.status === 200 && wsList.json.success, `run ${run}: workspaces list failed`);
  const workspaces = wsList.json.data.workspaces as Array<{
    membership_kind: string;
    mine_id: number;
    cooperative_id?: number;
    roles: string[];
  }>;

  const community = workspaces.filter((w) => w.membership_kind === "COMMUNITY");
  const operational = workspaces.filter((w) => w.membership_kind === "OPERATIONAL");
  assert(community.length >= 1, `run ${run}: expected COMMUNITY workspace`);
  assert(operational.length >= 1, `run ${run}: expected OPERATIONAL workspace`);
  assert(
    community.some((w) => w.cooperative_id === 1 && w.mine_id === 1),
    `run ${run}: community coop1 missing`,
  );
  assert(
    operational.some((w) => w.mine_id === 2 && w.roles.includes("FLEET_OWNER")),
    `run ${run}: operational mine B missing`,
  );
  assert(
    !community.some((w) => w.mine_id === 2 && w.roles.includes("FLEET_OWNER")),
    `run ${run}: fleet role must not appear as COMMUNITY`,
  );

  const denyOpOnMineBAsCommunity = await selectWorkspace(token, {
    mine_id: 2,
    cooperative_id: 2,
    membership_kind: "COMMUNITY",
  });
  assert(
    denyOpOnMineBAsCommunity.status === 403,
    `run ${run}: HOUSEHOLD must not select mine B as community coop2`,
  );

  const allowCommunity = await selectWorkspace(token, {
    mine_id: 1,
    cooperative_id: 1,
    membership_kind: "COMMUNITY",
  });
  assert(allowCommunity.status === 200, `run ${run}: community select mine A failed`);

  const me = await http("/api/households/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(me.status === 200 && me.json.data.household.cooperative_id === 1, `run ${run}: households/me coop leak`);

  const wallet = await http("/api/wallet/household", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(wallet.status === 200, `run ${run}: household wallet failed`);

  const denyDriver = await http("/api/driver/missions", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(
    denyDriver.status === 403 && denyDriver.json?.error?.code === "workspace_access_denied",
    `run ${run}: household session must not access driver missions`,
  );

  const allowOp = await selectWorkspace(token, {
    mine_id: 2,
    membership_kind: "OPERATIONAL",
  });
  assert(allowOp.status === 200, `run ${run}: operational select mine B failed`);

  const denyHouseholdOnWrongMine = await http("/api/households/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(
    denyHouseholdOnWrongMine.status === 200 &&
      denyHouseholdOnWrongMine.json.data.household.cooperative_id === 1,
    `run ${run}: households/me must stay coop1 after op mine select`,
  );

  const hhOnly = await loginAs("09000001001");
  const denyMine2Op = await selectWorkspace(hhOnly, { mine_id: 2, membership_kind: "OPERATIONAL" });
  assert(
    denyMine2Op.status === 403 && denyMine2Op.json?.error?.code === "workspace_access_denied",
    `run ${run}: household-only user must not select mine 2 operational`,
  );

  // eslint-disable-next-line no-console
  console.log(`WS-DUAL-ROLE-1 run ${run} OK`);
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  // eslint-disable-next-line no-console
  console.log("WS-DUAL-ROLE-1: all 3 runs passed");
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
