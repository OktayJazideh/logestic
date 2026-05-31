/**
 * NATID-ENF-1: national_id uniqueness enforced before commit (household + fleet owner + cooperative).
 * Run 3x: npm run test:natid-enf1
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { nationalIdFromSeed } from "../src/lib/nationalId";
import {
  NATIONAL_ID_CONFLICT_CODE,
  NATIONAL_ID_CONFLICT_MESSAGE,
} from "../src/lib/nationalIdEnforcement";
import * as workspaceRepo from "../src/repositories/workspaceMembershipsRepository";

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

function assertConflict409(res: { status: number; json: { error?: { code?: string; message?: string } } }, run: number, label: string) {
  assert(res.status === 409, `run ${run}: ${label} expected 409, got ${res.status}: ${JSON.stringify(res.json)}`);
  assert(
    res.json.error?.code === NATIONAL_ID_CONFLICT_CODE,
    `run ${run}: ${label} code must be ${NATIONAL_ID_CONFLICT_CODE}`,
  );
  assert(
    res.json.error?.message === NATIONAL_ID_CONFLICT_MESSAGE,
    `run ${run}: ${label} message must match uniform conflict text`,
  );
}

async function runOnce(run: number) {
  await appContext.entities.hydrate();

  const seedBase = String((Date.now() + run * 7919) % 1e9).padStart(9, "0");
  const nationalId = nationalIdFromSeed(seedBase);

  const unique = `${Date.now()}${run}${Math.floor(Math.random() * 1e6)}`;
  const mobileA = `0916${String(run).padStart(2, "0")}${unique.slice(-7)}`;
  const mobileB = `0917${String(run).padStart(2, "0")}${unique.slice(-7)}`;

  await appContext.userStore.upsertUserByMobile(mobileA, "HOUSEHOLD", { is_active: true });
  await workspaceRepo.upsertMembership({
    user_id: (await appContext.userStore.getByMobile(mobileA))!.id,
    mine_id: 1,
    cooperative_id: 1,
    role_in_workspace: "HOUSEHOLD",
  });
  await appContext.userStore.upsertUserByMobile(mobileB, "HOUSEHOLD", { is_active: true });
  await workspaceRepo.upsertMembership({
    user_id: (await appContext.userStore.getByMobile(mobileB))!.id,
    mine_id: 1,
    cooperative_id: 1,
    role_in_workspace: "HOUSEHOLD",
  });

  const tokenA = await loginAs(mobileA);
  const tokenB = await loginAs(mobileB);

  await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ mine_id: 1, cooperative_id: 1 }),
  });
  await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ mine_id: 1, cooperative_id: 1 }),
  });

  const registerA = await http("/api/households/register", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      village_id: 1,
      head_name: `خانوار A ${run}`,
      national_id: nationalId,
      bank_iban: "IR820540102680020817909002",
    }),
  });
  assert(registerA.status === 201, `run ${run}: register A failed: ${JSON.stringify(registerA.json)}`);

  const registerDup = await http("/api/households/register", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({
      village_id: 1,
      head_name: `خانوار B ${run}`,
      national_id: nationalId,
      bank_iban: "IR820540102680020817909002",
    }),
  });
  assertConflict409(registerDup, run, "household register duplicate");

  const coopDup = await http("/api/coop/households/request", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({
      cooperative_id: 1,
      village_id: 1,
      head_name: `متقاضی B ${run}`,
      national_id: nationalId,
      bank_iban: "IR820540102680020817909002",
    }),
  });
  assertConflict409(coopDup, run, "coop household request duplicate");

  const coopSame = await http("/api/coop/households/request", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      cooperative_id: 1,
      village_id: 1,
      head_name: `خانوار A بروز ${run}`,
      national_id: nationalId,
      bank_iban: "IR820540102680020817909002",
    }),
  });
  assert(coopSame.status === 201, `run ${run}: same entity same national_id must succeed: ${JSON.stringify(coopSame.json)}`);
  assert(
    coopSame.json.data?.household?.national_id === nationalId,
    `run ${run}: expected normalized national_id on response`,
  );

  const foMobileA = `0918${String(run).padStart(2, "0")}${unique.slice(-7)}`;
  const foMobileB = `0919${String(run).padStart(2, "0")}${unique.slice(-7)}`;
  await appContext.userStore.upsertUserByMobile(foMobileA, "FLEET_OWNER", { is_active: true });
  await appContext.userStore.upsertUserByMobile(foMobileB, "FLEET_OWNER", { is_active: true });
  const foTokenA = await loginAs(foMobileA);
  const foTokenB = await loginAs(foMobileB);

  const foNational = nationalIdFromSeed(String((Number(seedBase) + 33) % 1e9).padStart(9, "0"));
  const foReqA = await http("/api/coop/fleet_owners/request", {
    method: "POST",
    headers: { Authorization: `Bearer ${foTokenA}` },
    body: JSON.stringify({
      cooperative_id: 1,
      full_name: `مالک ${run}`,
      national_id: foNational,
      ownership_doc_url: "https://example.com/own.pdf",
      insurance_doc_url: "https://example.com/ins.pdf",
    }),
  });
  assert(foReqA.status === 201, `run ${run}: fleet owner request A failed: ${JSON.stringify(foReqA.json)}`);

  const foDup = await http("/api/coop/fleet_owners/request", {
    method: "POST",
    headers: { Authorization: `Bearer ${foTokenB}` },
    body: JSON.stringify({
      cooperative_id: 1,
      full_name: `مالک B ${run}`,
      national_id: foNational,
      ownership_doc_url: "https://example.com/own2.pdf",
      insurance_doc_url: "https://example.com/ins2.pdf",
    }),
  });
  assertConflict409(foDup, run, "fleet owner duplicate");

  const foSame = await http("/api/coop/fleet_owners/request", {
    method: "POST",
    headers: { Authorization: `Bearer ${foTokenA}` },
    body: JSON.stringify({
      cooperative_id: 1,
      full_name: `مالک A بروز ${run}`,
      national_id: foNational,
      ownership_doc_url: "https://example.com/own3.pdf",
      insurance_doc_url: "https://example.com/ins3.pdf",
    }),
  });
  assert(foSame.status === 201, `run ${run}: fleet owner same entity same national_id: ${JSON.stringify(foSame.json)}`);

  const adminToken = await loginAs("09000000000");
  const coopNational = nationalIdFromSeed(String((Number(seedBase) + 51) % 1e9).padStart(9, "0"));

  const createCoop = await http("/api/admin/cooperatives", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      mine_id: 1,
      name: `تعاونی تست ${run}`,
      national_id: coopNational,
    }),
  });
  assert(createCoop.status === 201, `run ${run}: admin cooperative create failed: ${JSON.stringify(createCoop.json)}`);

  const createCoopDup = await http("/api/admin/cooperatives", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      mine_id: 1,
      name: `تعاونی تکراری ${run}`,
      national_id: coopNational,
    }),
  });
  assertConflict409(createCoopDup, run, "cooperative duplicate");

  console.log(`run ${run}: NATID-ENF-1 OK`);
}

async function main() {
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  if (testServer) {
    await new Promise<void>((resolve, reject) => {
      testServer!.close((err) => (err ? reject(err) : resolve()));
    });
  }
  console.log("NATID-ENF-1: 3/3 passes");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
