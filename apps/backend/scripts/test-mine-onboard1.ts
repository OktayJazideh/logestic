/**
 * TENANT-ONBOARD-1: admin mine onboard API (mine + coop + rate card + contract v1).
 * Run: npm run test:mine-onboard1
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { prisma } from "../src/db/prisma";
import { loadMineFinanceConfig } from "../src/services/mineSettingsService";
import * as serviceContractsRepo from "../src/repositories/serviceContractsRepository";

const ADMIN_MOBILE = process.env.SEED_ADMIN_MOBILE?.trim() || "09000000000";

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

const ONBOARD_BODY = {
  name: "معدن گاما (onboard test)",
  slug: `GAMMA-${Date.now().toString(36).toUpperCase()}`,
  platform_fee: 0.01,
  community_rial_per_ton: 350_000,
  geofence: { lat: 29.5, lng: 57.2, radius_m: 600 },
  cooperative_name: "تعاونی گاما",
  village_name: "روستای گاما",
};

async function runOnce(run: number) {
  await appContext.mineData.hydrate();
  const adminToken = await loginAs(ADMIN_MOBILE);

  const created = await http("/api/admin/mines/onboard", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify(ONBOARD_BODY),
  });
  assert(created.status === 201 && created.json.success, `run ${run}: onboard failed: ${JSON.stringify(created.json)}`);

  const onboard = created.json.data.onboard as {
    mine_id: number;
    mine_code: string;
    cooperative_id: number;
    rate_card_id: number;
    service_contract_id: number;
    village_id: number | null;
    settings: { community_rial_per_ton: number; geofence: { lat: number; lng: number; radius_m?: number } };
  };

  assert(onboard.mine_code === ONBOARD_BODY.slug.toUpperCase(), `run ${run}: mine_code mismatch`);
  assert(onboard.village_id != null, `run ${run}: default village missing`);

  const duplicate = await http("/api/admin/mines/onboard", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify(ONBOARD_BODY),
  });
  assert(
    duplicate.status === 409 && duplicate.json?.error?.code === "mine_code_exists",
    `run ${run}: duplicate slug must be 409`,
  );

  const contract = await serviceContractsRepo.findActiveServiceContract({
    mine_id: onboard.mine_id,
    cooperative_id: onboard.cooperative_id,
    operation_type_code: "HAUL_TONNAGE",
  });
  assert(contract != null && contract.contract_version === 1, `run ${run}: contract v1 missing`);
  assert(contract.status === "ACTIVE", `run ${run}: contract not ACTIVE`);
  assert(
    contract.fixed_community_amount_rial_per_unit === ONBOARD_BODY.community_rial_per_ton,
    `run ${run}: community rate mismatch`,
  );

  const finance = await loadMineFinanceConfig(onboard.mine_id, { cooperative_id: onboard.cooperative_id });
  assert(finance.community_rial_per_ton === ONBOARD_BODY.community_rial_per_ton, `run ${run}: finance config mismatch`);

  const workspaces = await http("/api/workspaces", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(workspaces.status === 200, `run ${run}: workspaces list failed`);
  const list = workspaces.json.data.workspaces as Array<{ mine_id: number; mine_code: string }>;
  assert(
    list.some((w) => w.mine_id === onboard.mine_id),
    `run ${run}: onboarded mine missing from workspace list`,
  );

  const select = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: onboard.mine_id, membership_kind: "OPERATIONAL" }),
  });
  assert(select.status === 200 && select.json.success, `run ${run}: admin select onboarded mine failed`);

  const mineRow = await prisma.mines.findUnique({ where: { id: BigInt(onboard.mine_id) } });
  assert(mineRow != null, `run ${run}: mine row missing`);
  assert(mineRow.location_coordinates?.includes("29.5"), `run ${run}: geofence not stored`);
  assert(Number(mineRow.platform_fee_value) === ONBOARD_BODY.platform_fee, `run ${run}: platform fee not stored`);

  // eslint-disable-next-line no-console
  console.log(`MINE-ONBOARD-1 run ${run} OK — mine #${onboard.mine_id} (${onboard.mine_code})`);
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    ONBOARD_BODY.slug = `GAMMA-${Date.now().toString(36).toUpperCase()}-${run}`;
    await runOnce(run);
  }
  // eslint-disable-next-line no-console
  console.log("MINE-ONBOARD-1: all 3 runs passed");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    if (testServer) testServer.close();
    void prisma.$disconnect();
  });
