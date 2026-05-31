/**
 * IBAN-AUDIT-1: dedicated bank-account endpoint + audit action iban_changed.
 * Run 3x: npm run test:iban-audit1
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { prisma } from "../src/db/prisma";
import { IBAN_AUDIT_ACTION } from "../src/lib/ibanAudit";
import * as workspaceRepo from "../src/repositories/workspaceMembershipsRepository";

const IBAN_A = "IR820540102680020817909002";
const IBAN_B = "IR820540102680020817909099";
const IBAN_C = "IR820540102680020817909196";
const INVALID_IBAN = "IR0000000000000000000000";

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

async function latestIbanAudit(entityId: number) {
  return prisma.audit_logs.findFirst({
    where: {
      entity_type: "household",
      entity_id: String(entityId),
      action: IBAN_AUDIT_ACTION,
    },
    orderBy: { created_at: "desc" },
  });
}

async function runOnce(run: number) {
  await appContext.entities.hydrate();
  await ensureCoopOperator();

  const operatorToken = await loginAs("09000000111");
  const unique = `${Date.now()}${run}${Math.floor(Math.random() * 1e6)}`;
  const applicantMobile = `0914${String(run).padStart(2, "0")}${unique.slice(-7)}`;

  await appContext.userStore.upsertUserByMobile(applicantMobile, "HOUSEHOLD", { is_active: true });
  const applicantToken = await loginAs(applicantMobile);

  const request = await http("/api/coop/households/request", {
    method: "POST",
    headers: { Authorization: `Bearer ${applicantToken}` },
    body: JSON.stringify({
      cooperative_id: 1,
      village_id: 1,
      head_name: `خانوار IBAN ${run}`,
      national_id: `iban-${unique}`,
      bank_iban: IBAN_A,
    }),
  });
  assert(request.status === 201, `run ${run}: household request failed: ${JSON.stringify(request.json)}`);
  const household = request.json.data.household;
  assert(household.bank_iban === IBAN_A, `run ${run}: initial IBAN mismatch`);

  const bankAccount = await http(`/api/coop/households/${household.id}/bank-account`, {
    method: "POST",
    headers: { Authorization: `Bearer ${applicantToken}` },
    body: JSON.stringify({
      bank_iban: IBAN_B,
      reason: `تست IBAN-AUDIT-1 run ${run}`,
    }),
  });
  assert(bankAccount.status === 200, `run ${run}: bank-account failed: ${JSON.stringify(bankAccount.json)}`);
  assert(bankAccount.json.data.household.bank_iban === IBAN_B, `run ${run}: IBAN not updated`);

  const auditCoop = await latestIbanAudit(household.id);
  assert(auditCoop != null, `run ${run}: iban_changed audit missing after bank-account`);
  const beforeCoop = auditCoop.before_value as { bank_iban?: string };
  const afterCoop = auditCoop.after_value as { bank_iban?: string };
  assert(beforeCoop.bank_iban === IBAN_A, `run ${run}: audit before_iban expected ${IBAN_A}`);
  assert(afterCoop.bank_iban === IBAN_B, `run ${run}: audit after_iban expected ${IBAN_B}`);
  assert(auditCoop.reason === `تست IBAN-AUDIT-1 run ${run}`, `run ${run}: audit reason missing`);

  const resubmitIban = await http(`/api/coop/households/${household.id}/resubmit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${applicantToken}` },
    body: JSON.stringify({ bank_iban: IBAN_C }),
  });
  assert(resubmitIban.status === 400, `run ${run}: resubmit with bank_iban must be 400`);
  assert(
    resubmitIban.json?.error?.code === "iban_use_dedicated_endpoint",
    `run ${run}: expected iban_use_dedicated_endpoint`,
  );

  const invalid = await http(`/api/coop/households/${household.id}/bank-account`, {
    method: "POST",
    headers: { Authorization: `Bearer ${operatorToken}` },
    body: JSON.stringify({ bank_iban: INVALID_IBAN }),
  });
  assert(invalid.status === 400, `run ${run}: invalid IBAN must be 400`);
  assert(invalid.json?.error?.code === "invalid_iban", `run ${run}: expected invalid_iban`);

  await workspaceRepo.upsertMembership({
    user_id: household.user_id,
    mine_id: 1,
    cooperative_id: 1,
    role_in_workspace: "HOUSEHOLD",
  });
  await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${applicantToken}` },
    body: JSON.stringify({ mine_id: 1, cooperative_id: 1 }),
  });

  const meIban = await http("/api/households/me/iban", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${applicantToken}` },
    body: JSON.stringify({ bank_iban: IBAN_C }),
  });
  assert(meIban.status === 200, `run ${run}: PATCH /households/me/iban failed: ${JSON.stringify(meIban.json)}`);
  assert(meIban.json.data.household.bank_iban === IBAN_C, `run ${run}: me/iban IBAN not updated`);

  const auditMe = await latestIbanAudit(household.id);
  assert(auditMe != null, `run ${run}: iban_changed audit missing after me/iban`);
  const beforeMe = auditMe.before_value as { bank_iban?: string };
  const afterMe = auditMe.after_value as { bank_iban?: string };
  assert(beforeMe.bank_iban === IBAN_B, `run ${run}: me/iban audit before expected ${IBAN_B}`);
  assert(afterMe.bank_iban === IBAN_C, `run ${run}: me/iban audit after expected ${IBAN_C}`);

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
  console.log("IBAN-AUDIT-1: 3/3 passes");
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
