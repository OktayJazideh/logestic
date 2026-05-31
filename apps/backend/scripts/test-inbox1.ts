/**
 * WF-ROLE-INBOX-1: role-shared inbox + alternate COOP_ADMIN approve (no per-user lock).
 * Run 3x: npm run test:inbox1
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { prisma } from "../src/db/prisma";
import { toBig } from "../src/repositories/id";

const COOP_IBAN = "IR820540102680020817909002";

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

async function selectWorkspace(
  token: string,
  mineId: number,
  opts?: { cooperativeId?: number; membership_kind?: "COMMUNITY" | "OPERATIONAL" },
) {
  const body: Record<string, unknown> = { mine_id: mineId };
  if (opts?.cooperativeId != null) body.cooperative_id = opts.cooperativeId;
  if (opts?.membership_kind) body.membership_kind = opts.membership_kind;
  else if (opts?.cooperativeId != null) body.membership_kind = "COMMUNITY";

  const r = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (r.status !== 200 || !r.json.success) {
    throw new Error(`workspace select failed: ${JSON.stringify(r.json)}`);
  }
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

type InboxItem = {
  type: string;
  id: number;
  title: string;
  status: string;
  waiting_since: string;
  required_roles: string[];
};

async function fetchInbox(token: string, query = ""): Promise<InboxItem[]> {
  const r = await http(`/api/inbox${query}`, { headers: { Authorization: `Bearer ${token}` } });
  assert(r.status === 200 && r.json.success, `inbox failed: ${JSON.stringify(r.json)}`);
  return r.json.data.items as InboxItem[];
}

async function verifyOneMission(run: number, qty: number): Promise<number> {
  const adminToken = await loginAs("09000000000");
  const driverToken = await loginAs("09000000003");
  const opAdminToken = await loginAs("09000000002");
  await selectWorkspace(driverToken, 1);
  await selectWorkspace(adminToken, 1);
  await selectWorkspace(opAdminToken, 1, { membership_kind: "OPERATIONAL" });

  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: 1, quantity_tons: qty, material_type: "ORE" }),
  });
  assert(seed.status === 200 && seed.json.success, `run ${run}: seed failed`);
  const missionId = seed.json.data.mission.id as number;

  for (const step of ["ACCEPTED", "ARRIVED"] as const) {
    const body = step === "ARRIVED" ? { step, latitude: 27.0, longitude: 55.0 } : { step };
    const r = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify(body),
    });
    assert(r.status === 200, `run ${run}: step ${step}`);
  }

  const ticketRes = await http(`/api/driver/missions/${missionId}/ticket`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const ticketId = ticketRes.json?.data?.ticket?.id as number;
  assert(ticketId != null, `run ${run}: no ticket`);

  const weights = await http(`/api/weighbridge/tickets/${ticketId}/weights`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ empty_weight: 10000, loaded_weight: 10000 + qty * 1000 }),
  });
  assert(weights.status === 200, `run ${run}: weights`);

  for (const step of ["LOADED", "IN_TRANSIT", "DELIVERED"] as const) {
    const body = step === "DELIVERED" ? { step, latitude: 27.05, longitude: 55.05 } : { step };
    const r = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify(body),
    });
    assert(r.status === 200, `run ${run}: step ${step}`);
  }

  const approve = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
  });
  assert(approve.status === 200 && approve.json.success, `run ${run}: ticket approve`);
  return missionId;
}

async function cleanupPeriodStatements(run: number) {
  const now = new Date();
  const period_key = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const rows = await prisma.period_statements.findMany({
    where: { mine_id: toBig(1), period_key },
  });
  for (const row of rows) {
    await prisma.approval_tasks.deleteMany({
      where: { entity_type: "period_statement", entity_id: String(row.id) },
    });
    await prisma.period_statement_approvals.deleteMany({ where: { period_statement_id: row.id } });
    await prisma.period_statement_lines.deleteMany({ where: { period_statement_id: row.id } });
    await prisma.period_statements.delete({ where: { id: row.id } });
  }
  if (run === 1) console.log(`cleanup: ${rows.length} period statement(s) for ${period_key}`);
}

async function runOnce(run: number) {
  await cleanupPeriodStatements(run);

  await prisma.cooperatives.update({
    where: { id: toBig(1) },
    data: { iban: COOP_IBAN, status: "ACTIVE" },
  });

  await verifyOneMission(run, 5 + run * 0.02);

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const adminToken = await loginAs("09000000000");
  const coopA = await loginAs("09000000001");
  const coopB = await loginAs("09000000101");
  const opAdminToken = await loginAs("09000000002");

  const draft = await http("/api/admin/finance/period-statements/draft", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: 1, cooperative_id: 1, year, month }),
  });
  assert(draft.status === 201 && draft.json.success, `run ${run}: draft failed`);
  const statementId = draft.json.data.statement.id as number;

  const submit = await http(`/api/admin/finance/period-statements/${statementId}/submit-review`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(submit.status === 200 && submit.json.data.statement.status === "PENDING_REVIEW", `run ${run}: submit`);

  await selectWorkspace(coopA, 1, { cooperativeId: 1, membership_kind: "COMMUNITY" });
  const inboxA1 = await fetchInbox(coopA);
  const psA = inboxA1.filter((i) => i.type === "period_statement" && i.id === statementId);
  assert(psA.length === 1, `run ${run}: coopA should see period_statement in inbox`);
  assert(psA[0]!.required_roles.includes("COOP_ADMIN"), `run ${run}: required_roles`);

  const noMine = await http("/api/inbox", { headers: { Authorization: `Bearer ${adminToken}` } });
  assert(noMine.status === 400, `run ${run}: inbox without workspace must be 400`);

  await selectWorkspace(coopB, 1, { cooperativeId: 1, membership_kind: "COMMUNITY" });
  const inboxBBefore = await fetchInbox(coopB);
  assert(
    inboxBBefore.some((i) => i.type === "period_statement" && i.id === statementId),
    `run ${run}: coopB should see same inbox item`,
  );

  const approveB = await http(`/api/admin/finance/period-statements/${statementId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopB}` },
  });
  assert(approveB.status === 200, `run ${run}: coopB approve without coopA`);

  const userB = await prisma.users.findFirst({ where: { mobile_number: "09000000101" } });
  assert(userB != null, `run ${run}: user B missing`);
  const audit = await prisma.audit_logs.findFirst({
    where: {
      entity_type: "period_statement",
      entity_id: String(statementId),
      action: "PERIOD_STATEMENT_APPROVED",
      performed_by_user_id: userB.id,
    },
    orderBy: { created_at: "desc" },
  });
  assert(audit != null, `run ${run}: audit must record performed_by coopB`);

  await selectWorkspace(coopA, 1, { cooperativeId: 1, membership_kind: "COMMUNITY" });
  const inboxAAfter = await fetchInbox(coopA);
  assert(
    !inboxAAfter.some((i) => i.type === "period_statement" && i.id === statementId),
    `run ${run}: coopA inbox should not show PS after coopB approved as COOP_ADMIN`,
  );

  await selectWorkspace(opAdminToken, 1, { membership_kind: "OPERATIONAL" });
  const inboxOp = await fetchInbox(opAdminToken);
  assert(
    inboxOp.some((i) => i.type === "period_statement" && i.id === statementId),
    `run ${run}: OPERATION_ADMIN still sees PS pending their approval`,
  );
  assert(!inboxOp.some((i) => i.type === "kyc"), `run ${run}: op admin no kyc in inbox`);
  assert(!inboxOp.some((i) => i.type === "objection"), `run ${run}: op admin no objection in inbox`);

  const sorted = [...inboxOp].map((i) => i.waiting_since);
  const sortedCopy = [...sorted].sort();
  assert(JSON.stringify(sorted) === JSON.stringify(sortedCopy), `run ${run}: inbox must be oldest-first`);

  await selectWorkspace(coopA, 1, { cooperativeId: 1, membership_kind: "COMMUNITY" });
  const kycOnly = await fetchInbox(coopA, "?types=kyc");
  assert(kycOnly.every((i) => i.type === "kyc"), `run ${run}: types[]=kyc filter`);

  const coop2Token = await loginAs("09000000102");
  await selectWorkspace(coop2Token, 2, { cooperativeId: 2, membership_kind: "COMMUNITY" });
  const inboxCoop2 = await fetchInbox(coop2Token);
  assert(
    !inboxCoop2.some((i) => i.type === "period_statement" && i.id === statementId),
    `run ${run}: coop2 must not see coop1 period statement`,
  );

  console.log(`run ${run}: PASS inbox statementId=${statementId}`);
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  if (testServer) {
    await new Promise<void>((resolve) => testServer!.close(() => resolve()));
  }
  console.log("test-inbox1: all 3 runs PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
