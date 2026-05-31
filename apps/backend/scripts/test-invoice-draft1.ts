/**
 * INVOICE-DRAFT-1: period statement draft → reject → approve → lock → 409 edit.
 * Run 3x: npm run test:invoice-draft1
 * Requires: DATABASE_URL, db:migrate, db:seed.
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

async function selectWorkspace(token: string, mineId: number) {
  const r = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: mineId }),
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

async function verifyOneMission(run: number, qty: number): Promise<number> {
  const adminToken = await loginAs("09000000000");
  const driverToken = await loginAs("09000000003");
  const coopOpToken = await loginAs("09000000111");
  const coopAdminToken = await loginAs("09000000001");
  await selectWorkspace(driverToken, 1);
  await selectWorkspace(coopOpToken, 1);
  await selectWorkspace(coopAdminToken, 1);

  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: 1, quantity_tons: qty, material_type: "ORE" }),
  });
  assert(seed.status === 200 && seed.json.success, `run ${run}: seed failed ${JSON.stringify(seed.json)}`);
  const missionId = seed.json.data.mission.id as number;

  for (const step of ["ACCEPTED", "ARRIVED"] as const) {
    const body =
      step === "ARRIVED" ? { step, latitude: 27.0, longitude: 55.0 } : { step };
    const r = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify(body),
    });
    assert(r.status === 200, `run ${run}: step ${step} failed`);
  }

  const ticketRes = await http(`/api/driver/missions/${missionId}/ticket`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const ticketId = ticketRes.json?.data?.ticket?.id as number;
  assert(ticketId != null, `run ${run}: no ticket`);

  const weights = await http(`/api/weighbridge/tickets/${ticketId}/weights`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopOpToken}` },
    body: JSON.stringify({ empty_weight: 10000, loaded_weight: 10000 + qty * 1000 }),
  });
  assert(weights.status === 200, `run ${run}: weights failed`);

  for (const step of ["LOADED", "IN_TRANSIT", "DELIVERED"] as const) {
    const body = step === "DELIVERED" ? { step, latitude: 27.05, longitude: 55.05 } : { step };
    const r = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify(body),
    });
    assert(r.status === 200, `run ${run}: step ${step} failed`);
  }

  const opAdminToken = await loginAs("09000000002");
  await selectWorkspace(opAdminToken, 1);
  const approve = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
  });
  assert(approve.status === 200 && approve.json.success, `run ${run}: ticket approve failed`);

  const mission = await prisma.missions.findUnique({ where: { id: BigInt(missionId) } });
  assert(mission?.status === "VERIFIED", `run ${run}: expected VERIFIED, got ${mission?.status}`);

  return missionId;
}

async function cleanupPeriodStatements(run: number) {
  const now = new Date();
  const period_key = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const rows = await prisma.period_statements.findMany({
    where: { mine_id: toBig(1), period_key },
  });
  for (const row of rows) {
    await prisma.period_statement_approvals.deleteMany({ where: { period_statement_id: row.id } });
    await prisma.period_statement_lines.deleteMany({ where: { period_statement_id: row.id } });
    await prisma.period_statements.delete({ where: { id: row.id } });
  }
  if (run === 1) {
    console.log(`cleanup: removed ${rows.length} period statement(s) for ${period_key}`);
  }
}

async function runOnce(run: number) {
  await cleanupPeriodStatements(run);

  await prisma.cooperatives.update({
    where: { id: toBig(1) },
    data: { iban: COOP_IBAN, status: "ACTIVE" },
  });

  const m1 = await verifyOneMission(run, 6 + run * 0.05);
  const m2 = await verifyOneMission(run, 7 + run * 0.05);
  assert(m1 !== m2, `run ${run}: expected distinct missions`);

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const period_key = `${year}-${String(month).padStart(2, "0")}`;

  const adminToken = await loginAs("09000000000");
  const coopAdminToken = await loginAs("09000000001");
  const opAdminToken = await loginAs("09000000002");

  const draft = await http("/api/admin/finance/period-statements/draft", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: 1, cooperative_id: 1, year, month }),
  });
  assert(draft.status === 201 && draft.json.success, `run ${run}: draft failed ${JSON.stringify(draft.json)}`);

  const statement = draft.json.data.statement as {
    id: number;
    service_count: number;
    operational_rial: number;
    community_rial: number;
    payable_rial: number;
    lines: Array<{ mission_id: number; operational_rial: number; community_rial: number }>;
  };

  assert(statement.service_count >= 2, `run ${run}: expected >=2 lines, got ${statement.service_count}`);
  const lineIds = new Set(statement.lines.map((l) => l.mission_id));
  assert(lineIds.has(m1) && lineIds.has(m2), `run ${run}: seeded missions missing from lines`);

  const sumOp = statement.lines.reduce((s, l) => s + l.operational_rial, 0);
  const sumComm = statement.lines.reduce((s, l) => s + l.community_rial, 0);
  assert(
    Math.abs(sumOp - statement.operational_rial) < 0.02,
    `run ${run}: operational total mismatch ${sumOp} vs ${statement.operational_rial}`,
  );
  assert(
    Math.abs(sumComm - statement.community_rial) < 0.02,
    `run ${run}: community total mismatch`,
  );
  assert(
    Math.abs(statement.payable_rial - (statement.operational_rial + statement.community_rial)) < 0.02,
    `run ${run}: payable mismatch`,
  );

  const submit = await http(`/api/admin/finance/period-statements/${statement.id}/submit-review`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(submit.status === 200 && submit.json.data.statement.status === "PENDING_REVIEW", `run ${run}: submit failed`);

  const reject = await http(`/api/admin/finance/period-statements/${statement.id}/reject`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopAdminToken}` },
    body: JSON.stringify({ reason: "مغایرت باسکول — تست INVOICE-DRAFT-1" }),
  });
  assert(reject.status === 200 && reject.json.data.statement.status === "DRAFT", `run ${run}: reject failed`);
  assert(!!reject.json.data.statement.rejection_reason, `run ${run}: rejection_reason missing`);

  const submit2 = await http(`/api/admin/finance/period-statements/${statement.id}/submit-review`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(submit2.status === 200, `run ${run}: resubmit failed`);

  const coopApprove = await http(`/api/admin/finance/period-statements/${statement.id}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopAdminToken}` },
  });
  assert(coopApprove.status === 200, `run ${run}: coop approve failed`);

  const mineApprove = await http(`/api/admin/finance/period-statements/${statement.id}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
  });
  assert(mineApprove.status === 200 && mineApprove.json.data.statement.status === "APPROVED", `run ${run}: mine approve`);

  const lock = await http(`/api/admin/finance/period-statements/${statement.id}/lock`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(lock.status === 200 && lock.json.data.statement.status === "LOCKED", `run ${run}: lock failed`);
  const locked = lock.json.data.statement as {
    cooperative_payable_iban: string;
    mine_payable: boolean;
  };
  assert(locked.cooperative_payable_iban === COOP_IBAN, `run ${run}: payable IBAN must be cooperative official`);
  assert(locked.mine_payable === true, `run ${run}: mine_payable flag`);

  const lineId = statement.lines[0]!.id;
  const edit = await http(`/api/admin/finance/period-statements/${statement.id}/lines/${lineId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ operational_rial: 1 }),
  });
  assert(edit.status === 409, `run ${run}: locked edit must be 409, got ${edit.status}`);

  const skipLock = await http(`/api/admin/finance/period-statements/${statement.id}/lock`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(skipLock.status === 400, `run ${run}: double lock should fail`);

  console.log(`run ${run}: PASS period_key=${period_key} id=${statement.id}`);
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  if (testServer) {
    await new Promise<void>((resolve) => testServer!.close(() => resolve()));
  }
  console.log("test-invoice-draft1: all 3 runs PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
