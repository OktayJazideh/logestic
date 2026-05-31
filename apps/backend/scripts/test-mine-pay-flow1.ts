/**
 * MINE-PAY-FLOW-1: mine payment → coop only export; internal payout separate; lock guard.
 * Run 3x: npm run test:mine-pay-flow1
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { prisma } from "../src/db/prisma";
import { toBig } from "../src/repositories/id";
import * as settlementRepo from "../src/repositories/settlementRepository";

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
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { status: res.status, text, json: null as unknown as Record<string, unknown> };
  }
  return { status: res.status, text, json };
}

async function pollJobHttp(jobId: string, token: string) {
  for (let i = 0; i < 150; i++) {
    const r = await http(`/api/admin/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status !== 200 || !r.json.success) {
      throw new Error(`poll job ${jobId} failed: ${JSON.stringify(r.json)}`);
    }
    const job = (r.json.data as { job: { status: string; error?: string; result?: unknown } }).job;
    if (job.status === "completed") return job;
    if (job.status === "failed") throw new Error(job.error ?? "job_failed");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`poll timeout for job ${jobId}`);
}

async function loginAs(mobile: string) {
  await http("/api/auth/request-otp", { method: "POST", body: JSON.stringify({ mobile_number: mobile }) });
  const devOtp = await http(`/api/auth/__dev/otp?mobile_number=${mobile}`);
  const code = (devOtp.json?.data as { otp?: string })?.otp;
  if (!code) throw new Error(`dev otp missing for ${mobile}`);
  const verify = await http("/api/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ mobile_number: mobile, otp_code: code }),
  });
  if (verify.status !== 200 || !verify.json.success) {
    throw new Error(`verify failed for ${mobile}: ${JSON.stringify(verify.json)}`);
  }
  return (verify.json.data as { access_token: string }).access_token;
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
  assert(seed.status === 200 && seed.json.success === true, `run ${run}: seed failed`);

  const missionId = (seed.json.data as { mission: { id: number } }).mission.id;

  for (const step of ["ACCEPTED", "ARRIVED"] as const) {
    const body = step === "ARRIVED" ? { step, latitude: 27.0, longitude: 55.0 } : { step };
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
  const ticketId = (ticketRes.json?.data as { ticket?: { id: number } })?.ticket?.id;
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
  const approve = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
  });
  assert(approve.status === 200 && approve.json.success === true, `run ${run}: approve failed`);

  const mission = await prisma.missions.findUnique({ where: { id: BigInt(missionId) } });
  assert(mission?.status === "VERIFIED", `run ${run}: expected VERIFIED`);
  return missionId;
}

async function cleanupPeriodAndBatch(year: number, month: number) {
  const period_key = `${year}-${String(month).padStart(2, "0")}`;
  const periodStart = new Date(Date.UTC(year, month - 1, 1));

  const statements = await prisma.period_statements.findMany({
    where: { mine_id: toBig(1), period_key },
  });
  for (const row of statements) {
    await prisma.period_statement_approvals.deleteMany({ where: { period_statement_id: row.id } });
    await prisma.period_statement_lines.deleteMany({ where: { period_statement_id: row.id } });
    await prisma.period_statements.delete({ where: { id: row.id } });
  }

  const batches = await prisma.settlement_batches.findMany({
    where: { mine_id: toBig(1), period_start: periodStart },
    select: { id: true },
  });
  for (const b of batches) {
    await prisma.settlement_batch_approvals.deleteMany({ where: { settlement_batch_id: b.id } });
  }
  await prisma.settlement_batches.deleteMany({
    where: { mine_id: toBig(1), period_start: periodStart },
  });
}

async function runOnce(run: number) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  await cleanupPeriodAndBatch(year, month);

  await prisma.cooperatives.update({
    where: { id: toBig(1) },
    data: { iban: COOP_IBAN, status: "ACTIVE" },
  });

  await verifyOneMission(run, 5 + run * 0.1);

  const adminToken = await loginAs("09000000000");
  const coopAdminToken = await loginAs("09000000001");
  const opAdminToken = await loginAs("09000000002");

  const opLockerToken = await loginAs("09000000103");
  await selectWorkspace(opAdminToken, 1);
  await selectWorkspace(opLockerToken, 1);
  await selectWorkspace(coopAdminToken, 1);

  const close = await http("/api/admin/settlement/monthly-close", {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
    body: JSON.stringify({ mine_id: 1, year, month }),
  });
  assert(close.status === 202 && close.json.success === true, `run ${run}: monthly-close failed`);
  const closeJob = await pollJobHttp((close.json.data as { job_id: string }).job_id, opAdminToken);
  const closeResult = closeJob.result as { batch: { id: number }; period_statements?: Array<{ id: number }> };
  const batchId = closeResult.batch.id;
  assert(batchId > 0, `run ${run}: batch id missing`);

  let statementId: number;
  const psFromJob = closeResult.period_statements?.[0]?.id;
  if (psFromJob) {
    statementId = psFromJob;
  } else {
    const list = await http(
      `/api/admin/finance/period-statements?mine_id=1&cooperative_id=1&year=${year}&month=${month}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    statementId = ((list.json.data as { statements: Array<{ id: number }> }).statements[0]?.id)!;
  }
  assert(statementId > 0, `run ${run}: period statement missing`);

  const submit = await http(`/api/admin/finance/period-statements/${statementId}/submit-review`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(submit.status === 200, `run ${run}: submit-review failed`);

  await http(`/api/admin/finance/period-statements/${statementId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopAdminToken}` },
  });
  const mineApprove = await http(`/api/admin/finance/period-statements/${statementId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
  });
  assert(mineApprove.status === 200, `run ${run}: approve failed`);

  const lockPs = await http(`/api/admin/finance/period-statements/${statementId}/lock`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(lockPs.status === 200, `run ${run}: period statement lock failed`);

  await http(`/api/admin/settlement/${batchId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopAdminToken}` },
  });
  await http(`/api/admin/settlement/${batchId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
  });

  const lockBatchEarly = await http(`/api/admin/settlement/${batchId}/lock`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opLockerToken}` },
  });
  assert(
    lockBatchEarly.status === 409 && lockBatchEarly.json?.error?.code === "mine_payment_required",
    `run ${run}: lock batch without mine paid must be mine_payment_required`,
  );

  const minePay = await http(`/api/admin/finance/period-statements/${statementId}/register-mine-payment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ payment_reference: `MINEREF${run}00000001` }),
  });
  assert(minePay.status === 200, `run ${run}: register mine payment failed`);

  const lockBatch = await http(`/api/admin/settlement/${batchId}/lock`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opLockerToken}` },
  });
  assert(lockBatch.status === 200, `run ${run}: lock batch after mine paid failed`);

  const mineExport = await http(`/api/admin/finance/period-statements/${statementId}/export-mine-payment`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(mineExport.status === 200, `run ${run}: mine export failed`);
  const mineCsv = mineExport.text;
  assert(mineCsv.includes("MINE_TO_COOP"), `run ${run}: mine export missing MINE_TO_COOP`);
  assert(mineCsv.includes(COOP_IBAN), `run ${run}: mine export must contain coop IBAN only`);
  assert(!mineCsv.includes("INTERNAL_FLEET_OWNER"), `run ${run}: mine export must not mix internal payees`);

  const owner = await prisma.fleet_owners.findFirst({ where: { cooperative_id: toBig(1) } });
  if (owner?.bank_iban && owner.bank_iban !== COOP_IBAN) {
    assert(!mineCsv.includes(owner.bank_iban), `run ${run}: mine export must not contain owner IBAN`);
  }

  const internalRows = await settlementRepo.buildExportRows(batchId);
  assert(internalRows.length > 0, `run ${run}: internal export rows empty`);
  assert(
    internalRows.every((r) => r.payee_type !== "MINE_TO_COOP"),
    `run ${run}: internal export must not contain MINE_TO_COOP`,
  );
  assert(
    internalRows.some((r) => r.payee_type === "INTERNAL_FLEET_OWNER"),
    `run ${run}: internal export must have fleet owner rows`,
  );
  const internalCsv = settlementRepo.exportRowsToCsv(internalRows, "internal");
  assert(internalCsv.includes("INTERNAL_FLEET_OWNER"), `run ${run}: internal csv missing payee_type`);
  assert(!internalCsv.includes("MINE_TO_COOP"), `run ${run}: internal csv must not contain MINE_TO_COOP`);

  console.log(`run ${run}: PASS batch=${batchId} statement=${statementId}`);
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  if (testServer) {
    await new Promise<void>((resolve) => testServer!.close(() => resolve()));
  }
  console.log("test-mine-pay-flow1: all 3 runs PASS");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
