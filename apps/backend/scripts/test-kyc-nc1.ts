/**
 * KYC-NC-1: NEEDS_CORRECTION workflow — request-correction, resubmit, RBAC.
 * Run 3x: npm run test:kyc-nc1
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { prisma } from "../src/db/prisma";
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

async function ensureCoopOperator() {
  const mobile = "09000000111";
  const user = await appContext.userStore.upsertUserByMobile(mobile, "COOP_OPERATOR", {
    is_active: true,
    cooperative_id: 1,
  });
  await workspaceRepo.upsertMembership({
    user_id: user.id,
    mine_id: 1,
    cooperative_id: 1,
    role_in_workspace: "COOP_OPERATOR",
  });
}

async function runOnce(run: number) {
  await appContext.entities.hydrate();
  await ensureCoopOperator();

  const operatorToken = await loginAs("09000000111");
  const unique = `${Date.now()}${run}${Math.floor(Math.random() * 1e6)}`;
  const applicantMobile = `0906${String(run).padStart(2, "0")}${unique.slice(-7)}`;

  await appContext.userStore.upsertUserByMobile(applicantMobile, "HOUSEHOLD", { is_active: true });
  const applicantToken = await loginAs(applicantMobile);

  const request = await http("/api/coop/households/request", {
    method: "POST",
    headers: { Authorization: `Bearer ${applicantToken}` },
    body: JSON.stringify({
      cooperative_id: 1,
      village_id: 1,
      head_name: `متقاضی NC ${run}`,
      national_id: `nc-${unique}`,
      bank_iban: "IR820540102680020817909002",
    }),
  });
  assert(request.status === 201, `run ${run}: household request failed: ${JSON.stringify(request.json)}`);
  const household = request.json.data.household;

  const approve = await http(`/api/coop/households/${household.id}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${operatorToken}` },
    body: JSON.stringify({}),
  });
  assert(approve.status === 200, `run ${run}: approve failed: ${JSON.stringify(approve.json)}`);
  assert(approve.json.data.household.status === "APPROVED", `run ${run}: expected APPROVED`);

  const correctionReason = "لطفاً تصویر سند بانکی واضح‌تر بارگذاری شود — تست NC1";
  const requestCorrection = await http(`/api/coop/households/${household.id}/request-correction`, {
    method: "POST",
    headers: { Authorization: `Bearer ${operatorToken}` },
    body: JSON.stringify({ reason: correctionReason }),
  });
  assert(
    requestCorrection.status === 200,
    `run ${run}: request-correction failed: ${JSON.stringify(requestCorrection.json)}`,
  );
  assert(
    requestCorrection.json.data.household.status === "NEEDS_CORRECTION",
    `run ${run}: expected NEEDS_CORRECTION`,
  );

  const auditCorrection = await prisma.audit_logs.findFirst({
    where: {
      entity_type: "household",
      entity_id: String(household.id),
      action: "kyc_change",
      reason: correctionReason,
    },
    orderBy: { created_at: "desc" },
  });
  assert(auditCorrection != null, `run ${run}: kyc_change audit missing for correction`);

  const inboxNc = await http("/api/coop/kyc/inbox?status=NEEDS_CORRECTION", {
    headers: { Authorization: `Bearer ${operatorToken}` },
  });
  assert(inboxNc.status === 200, `run ${run}: NEEDS_CORRECTION inbox failed`);
  const ncIds = (inboxNc.json.data.items as Array<{ id: number; entity_type: string; correction_reason?: string }>)
    .filter((h) => h.entity_type === "household")
    .map((h) => h.id);
  assert(ncIds.includes(household.id), `run ${run}: household not in NEEDS_CORRECTION inbox`);
  const inboxRow = (
    inboxNc.json.data.items as Array<{ id: number; entity_type: string; correction_reason?: string }>
  ).find((h) => h.entity_type === "household" && h.id === household.id);
  assert(inboxRow?.correction_reason === correctionReason, `run ${run}: correction_reason in inbox`);

  const bankAccount = await http(`/api/coop/households/${household.id}/bank-account`, {
    method: "POST",
    headers: { Authorization: `Bearer ${applicantToken}` },
    body: JSON.stringify({ bank_iban: "IR820540102680020817909099", reason: "اصلاح شبا NC1" }),
  });
  assert(bankAccount.status === 200, `run ${run}: bank-account failed: ${JSON.stringify(bankAccount.json)}`);

  const resubmit = await http(`/api/coop/households/${household.id}/resubmit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${applicantToken}` },
    body: JSON.stringify({ head_name: `متقاضی NC ${run} (اصلاح)` }),
  });
  assert(resubmit.status === 200, `run ${run}: resubmit failed: ${JSON.stringify(resubmit.json)}`);
  assert(resubmit.json.data.household.status === "PENDING", `run ${run}: expected PENDING after resubmit`);

  const auditResubmit = await prisma.audit_logs.findFirst({
    where: {
      entity_type: "household",
      entity_id: String(household.id),
      action: "kyc_resubmitted",
    },
    orderBy: { created_at: "desc" },
  });
  assert(auditResubmit != null, `run ${run}: kyc_resubmitted audit missing`);

  const driverMobile = `0907${String(run).padStart(2, "0")}${unique.slice(-7)}`;
  await appContext.userStore.upsertUserByMobile(driverMobile, "DRIVER", { is_active: true });
  const driverToken = await loginAs(driverMobile);

  const forbiddenResubmit = await http(`/api/coop/households/${household.id}/resubmit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ head_name: "دستکاری غیرمجاز" }),
  });
  assert(forbiddenResubmit.status === 403, `run ${run}: driver resubmit household must be 403`);

  const forbiddenIban = await http(`/api/coop/households/${household.id}/resubmit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${applicantToken}` },
    body: JSON.stringify({ bank_iban: "IR820540102680020817909196" }),
  });
  assert(forbiddenIban.status === 400, `run ${run}: resubmit bank_iban must redirect to bank-account`);

  // eslint-disable-next-line no-console
  console.log(`Run ${run} OK — household=${household.id}`);
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
  // eslint-disable-next-line no-console
  console.log("KYC-NC-1: 3/3 passes");
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
