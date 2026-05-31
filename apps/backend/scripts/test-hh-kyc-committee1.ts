/**
 * HH-KYC-COMMITTEE-1: configurable household approval quorum per cooperative.
 * Run 3x: npm run test:hh-kyc-committee1
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { prisma } from "../src/db/prisma";
import { KYC_HOUSEHOLD_APPROVAL_ACTION } from "../src/lib/kycWorkflow";
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

async function ensureCoopStaff() {
  for (const [mobile, role] of [
    ["09000000111", "COOP_OPERATOR"] as const,
    ["09000000101", "COOP_ADMIN"] as const,
    ["09000000102", "COOP_ADMIN"] as const,
    ["09000000112", "COOP_OPERATOR"] as const,
  ]) {
    const coopId = mobile.endsWith("12") || mobile.endsWith("02") ? 2 : 1;
    const user = await appContext.userStore.upsertUserByMobile(mobile, role, {
      is_active: true,
      cooperative_id: coopId,
    });
    await workspaceRepo.upsertMembership({
      user_id: user.id,
      mine_id: coopId === 2 ? 2 : 1,
      cooperative_id: coopId,
      role_in_workspace: role,
    });
  }
}

async function createPendingHousehold(run: number, cooperativeId: number, villageId: number) {
  const unique = `${Date.now()}${run}${Math.floor(Math.random() * 1e6)}`;
  const applicantMobile = `0908${String(run).padStart(2, "0")}${unique.slice(-7)}`;
  await appContext.userStore.upsertUserByMobile(applicantMobile, "HOUSEHOLD", { is_active: true });
  const applicantToken = await loginAs(applicantMobile);

  const request = await http("/api/coop/households/request", {
    method: "POST",
    headers: { Authorization: `Bearer ${applicantToken}` },
    body: JSON.stringify({
      cooperative_id: cooperativeId,
      village_id: villageId,
      head_name: `کمیته ${run}`,
      national_id: `hhq-${unique}`,
      bank_iban: "IR820540102680020817909002",
    }),
  });
  assert(request.status === 201, `household request failed: ${JSON.stringify(request.json)}`);
  return request.json.data.household as { id: number; status: string };
}

async function runOnce(run: number) {
  await appContext.entities.hydrate();
  await ensureCoopStaff();

  const operatorToken = await loginAs("09000000111");

  // quorum=1 (default): single approve → APPROVED
  const hh1 = await createPendingHousehold(run, 1, 1);
  const approve1 = await http(`/api/coop/households/${hh1.id}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${operatorToken}` },
    body: JSON.stringify({}),
  });
  assert(approve1.status === 200, `run ${run} quorum=1: expected 200, got ${approve1.status}: ${JSON.stringify(approve1.json)}`);
  assert(approve1.json.data.household.status === "APPROVED", `run ${run} quorum=1: expected APPROVED`);

  const auditQ1 = await prisma.audit_logs.findFirst({
    where: {
      entity_type: "household",
      entity_id: String(hh1.id),
      action: KYC_HOUSEHOLD_APPROVAL_ACTION,
    },
    orderBy: { created_at: "desc" },
  });
  assert(auditQ1 != null, `run ${run} quorum=1: kyc_household_approval audit missing`);

  const approvalRowsQ1 = await prisma.household_approvals.count({
    where: { household_id: BigInt(hh1.id) },
  });
  assert(approvalRowsQ1 === 1, `run ${run} quorum=1: expected 1 approval row`);

  const walletQ1 = await prisma.wallets.findFirst({
    where: { wallet_type: "HOUSEHOLD", household_id: BigInt(hh1.id) },
  });
  assert(walletQ1 != null, `run ${run} quorum=1: wallet must exist after approve`);

  // quorum=2: first pending, second approves, duplicate → 409
  const coop2Saved = await prisma.cooperatives.findUnique({ where: { id: BigInt(2) } });
  await prisma.cooperatives.update({
    where: { id: BigInt(2) },
    data: { settings_json: { household_approval_quorum: 2 } },
  });

  try {
    const adminToken = await loginAs("09000000102");
    const operator2Token = await loginAs("09000000112");
    const hh2 = await createPendingHousehold(run + 1000, 2, 3);

    const first = await http(`/api/coop/households/${hh2.id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({}),
    });
    assert(first.status === 202, `run ${run} quorum=2 first: expected 202, got ${first.status}`);
    assert(first.json.data.pending === true, `run ${run} quorum=2: pending flag`);
    assert(first.json.data.approvals === 1, `run ${run} quorum=2: approvals=1`);
    assert(first.json.data.quorum === 2, `run ${run} quorum=2: quorum=2`);
    assert(first.json.data.household.status === "PENDING", `run ${run} quorum=2: still PENDING`);

    const dup = await http(`/api/coop/households/${hh2.id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({}),
    });
    assert(dup.status === 409, `run ${run} duplicate approver: expected 409, got ${dup.status}`);
    assert(dup.json.error?.code === "duplicate_approver", `run ${run} duplicate code`);

    const second = await http(`/api/coop/households/${hh2.id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${operator2Token}` },
      body: JSON.stringify({}),
    });
    assert(second.status === 200, `run ${run} quorum=2 second: expected 200`);
    assert(second.json.data.household.status === "APPROVED", `run ${run} quorum=2: APPROVED`);

    const approvalRowsQ2 = await prisma.household_approvals.count({
      where: { household_id: BigInt(hh2.id) },
    });
    assert(approvalRowsQ2 === 2, `run ${run} quorum=2: expected 2 approval rows`);
  } finally {
    await prisma.cooperatives.update({
      where: { id: BigInt(2) },
      data: { settings_json: coop2Saved?.settings_json ?? { household_approval_quorum: 1 } },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Run ${run} OK — HH-KYC-COMMITTEE-1`);
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
  console.log("HH-KYC-COMMITTEE-1: 3/3 passes");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
