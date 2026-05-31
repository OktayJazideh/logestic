/**
 * BANK-AUTO-1: lock batch → enqueue execute-payouts → mock bank settles lines.
 * MOCK_BANK_FAIL=true → line FAILED, batch MANUAL_REVIEW.
 * Run: npm run test:bank-auto1 (3× success + 1× failure)
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

async function shutdownTestServer() {
  if (!testServer) return;
  await new Promise<void>((resolve) => testServer!.close(() => resolve()));
  testServer = null;
  baseUrl = "";
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

async function selectWorkspace(
  token: string,
  mineId: number,
  opts?: { cooperativeId?: number; membership_kind?: "OPERATIONAL" | "COMMUNITY" },
) {
  const r = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      mine_id: mineId,
      cooperative_id: opts?.cooperativeId,
      membership_kind: opts?.membership_kind ?? "OPERATIONAL",
    }),
  });
  if (r.status !== 200 || !r.json.success) {
    throw new Error(`workspace select failed: ${JSON.stringify(r.json)}`);
  }
}

async function cleanupPeriod(year: number, month: number) {
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const batches = await prisma.settlement_batches.findMany({
    where: {
      mine_id: toBig(1),
      period_start: periodStart,
    },
    select: { id: true },
  });
  for (const b of batches) {
    await prisma.payment_payouts.deleteMany({ where: { settlement_batch_id: b.id } });
    await prisma.settlement_batch_approvals.deleteMany({ where: { settlement_batch_id: b.id } });
  }
  await prisma.settlement_batches.deleteMany({
    where: {
      mine_id: toBig(1),
      period_start: periodStart,
    },
  });
  const period_key = `${year}-${String(month).padStart(2, "0")}`;
  const statements = await prisma.period_statements.findMany({
    where: { mine_id: toBig(1), period_key },
  });
  for (const row of statements) {
    await prisma.period_statement_approvals.deleteMany({ where: { period_statement_id: row.id } });
    await prisma.period_statement_lines.deleteMany({ where: { period_statement_id: row.id } });
    await prisma.period_statements.delete({ where: { id: row.id } });
  }
  await prisma.missions.updateMany({
    where: {
      status: "VERIFIED",
      load: { mine_id: toBig(1) },
      updated_at: { gte: periodStart, lte: periodEnd },
    },
    data: { status: "SETTLED", payment_state: "SETTLED" },
  });
  await prisma.hourly_work_logs.updateMany({
    where: {
      mine_id: toBig(1),
      status: "APPROVED",
      consultant_verified_at: { gte: periodStart, lte: periodEnd },
    },
    data: { status: "REJECTED" },
  });
}

async function verifyOneMission(run: number, qty: number): Promise<number> {
  const adminToken = await loginAs("09000000000");
  const driverToken = await loginAs("09000000003");
  const coopOpToken = await loginAs("09000000111");
  await selectWorkspace(driverToken, 1);
  await selectWorkspace(coopOpToken, 1, { cooperativeId: 1, membership_kind: "COMMUNITY" });

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
    assert(r.status === 200 && r.json.success === true, `run ${run}: step ${step} failed`);
  }

  const ticketRes = await http(`/api/driver/missions/${missionId}/ticket`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const ticketId = (ticketRes.json?.data as { ticket?: { id: number } })?.ticket?.id;
  assert(!!ticketId, `run ${run}: ticket missing`);

  const weights = await http(`/api/weighbridge/tickets/${ticketId}/weights`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopOpToken}` },
    body: JSON.stringify({ empty_weight: 10000, loaded_weight: 10000 + qty * 1000 }),
  });
  assert(weights.status === 200 && weights.json.success === true, `run ${run}: weights failed`);

  for (const step of ["LOADED", "IN_TRANSIT", "DELIVERED"] as const) {
    const body = step === "DELIVERED" ? { step, latitude: 27.05, longitude: 55.05 } : { step };
    const r = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify(body),
    });
    assert(r.status === 200 && r.json.success === true, `run ${run}: step ${step} failed`);
  }

  const opAdminToken = await loginAs("09000000002");
  await selectWorkspace(opAdminToken, 1);
  const approve = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
  });
  assert(approve.status === 200 && approve.json.success === true, `run ${run}: approve failed`);

  const mission = await prisma.missions.findUnique({ where: { id: BigInt(missionId) } });
  assert(mission?.status === "VERIFIED", `run ${run}: mission not VERIFIED`);
  return missionId;
}

async function prepareAndLockBatch(run: number, label: string): Promise<{ batchId: number; lockerToken: string }> {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  await cleanupPeriod(year, month);
  await verifyOneMission(run, 10 + run);

  const adminToken = await loginAs("09000000000");
  const coopAdminToken = await loginAs("09000000001");
  const opAdminToken = await loginAs("09000000002");
  const opLockerToken = await loginAs("09000000103");
  await selectWorkspace(opAdminToken, 1);
  await selectWorkspace(opLockerToken, 1);
  await selectWorkspace(coopAdminToken, 1, { cooperativeId: 1, membership_kind: "COMMUNITY" });

  const close = await http("/api/admin/settlement/monthly-close", {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
    body: JSON.stringify({ mine_id: 1, year, month }),
  });
  assert(close.status === 202 && close.json.success === true, `${label}: monthly-close failed`);
  const closeJob = await pollJobHttp((close.json.data as { job_id: string }).job_id, opAdminToken);
  const batchId = (closeJob.result as { batch: { id: number } }).batch.id;
  assert(batchId > 0, `${label}: batch id missing`);

  let statementId: number;
  const psFromJob = (closeJob.result as { period_statements?: Array<{ id: number }> }).period_statements?.[0]?.id;
  if (psFromJob) {
    statementId = psFromJob;
  } else {
    const list = await http(
      `/api/admin/finance/period-statements?mine_id=1&cooperative_id=1&year=${year}&month=${month}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    statementId = ((list.json.data as { statements: Array<{ id: number }> }).statements[0]?.id)!;
  }
  assert(statementId > 0, `${label}: period statement missing`);

  await http(`/api/admin/finance/period-statements/${statementId}/submit-review`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  await http(`/api/admin/finance/period-statements/${statementId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopAdminToken}` },
  });
  await http(`/api/admin/finance/period-statements/${statementId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
  });
  await http(`/api/admin/finance/period-statements/${statementId}/lock`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  await http(`/api/admin/settlement/${batchId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopAdminToken}` },
  });
  await http(`/api/admin/settlement/${batchId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
  });

  const minePay = await http(`/api/admin/finance/period-statements/${statementId}/register-mine-payment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ payment_reference: `MINEREF${run}${label}0001` }),
  });
  assert(minePay.status === 200, `${label}: register mine payment failed`);

  const lockBatch = await http(`/api/admin/settlement/${batchId}/lock`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opLockerToken}` },
  });
  assert(lockBatch.status === 200, `${label}: lock batch failed`);

  const payoutJob = (lockBatch.json.data as { payout_job?: { job_id: string } }).payout_job;
  assert(!!payoutJob?.job_id, `${label}: payout_job missing from lock response`);
  await pollJobHttp(payoutJob.job_id, opAdminToken);

  return { batchId, lockerToken: opLockerToken };
}

async function assertSuccessPayouts(run: number, batchId: number) {
  const batch = await prisma.settlement_batches.findUnique({ where: { id: toBig(batchId) } });
  assert(batch?.status === "SETTLED", `run ${run}: batch expected SETTLED, got ${batch?.status}`);
  assert(!!batch?.paid_at, `run ${run}: paid_at missing`);

  const lines = await prisma.settlement_lines.findMany({ where: { batch_id: toBig(batchId) } });
  const payouts = await prisma.payment_payouts.findMany({ where: { settlement_batch_id: toBig(batchId) } });
  assert(payouts.length === lines.length, `run ${run}: payout count mismatch`);
  assert(payouts.every((p) => p.status === "COMPLETED"), `run ${run}: not all payouts COMPLETED`);
  assert(payouts.every((p) => p.bank_reference?.startsWith("MOCK-")), `run ${run}: expected MOCK bank_ref`);

  const owner = await prisma.fleet_owners.findFirst({ where: { cooperative_id: toBig(1) } });
  if (owner?.bank_iban && owner.bank_iban !== COOP_IBAN) {
    for (const p of payouts) {
      const line = lines.find((l) => l.id === p.settlement_line_id);
      if (line?.note === "MISSION_OWNER") {
        assert(p.bank_reference !== owner.bank_iban, `run ${run}: must not pay mine/coop IBAN for owner line`);
      }
    }
  }

  const webhook = await http("/api/webhooks/bank", { method: "POST", body: JSON.stringify({}) });
  assert(webhook.status === 501, `run ${run}: webhook stub expected 501`);

  console.log(`run ${run}: PASS success batch=${batchId} payouts=${payouts.length}`);
}

async function assertFailurePayouts(label: string, batchId: number) {
  const batch = await prisma.settlement_batches.findUnique({ where: { id: toBig(batchId) } });
  assert(batch?.status === "MANUAL_REVIEW", `${label}: batch expected MANUAL_REVIEW, got ${batch?.status}`);

  const payouts = await prisma.payment_payouts.findMany({ where: { settlement_batch_id: toBig(batchId) } });
  assert(payouts.length > 0, `${label}: expected payouts`);
  assert(payouts.some((p) => p.status === "FAILED"), `${label}: expected at least one FAILED payout`);
  assert(payouts.every((p) => p.status === "FAILED"), `${label}: all lines should fail in MOCK_BANK_FAIL mode`);

  console.log(`${label}: PASS failure batch=${batchId} failed_payouts=${payouts.length}`);
}

async function runSuccessOnce(run: number) {
  process.env.BANK_ADAPTER = "mock";
  process.env.MOCK_BANK_FAIL = "false";
  const { batchId } = await prepareAndLockBatch(run, `success-${run}`);
  await assertSuccessPayouts(run, batchId);
}

async function runFailureOnce() {
  process.env.BANK_ADAPTER = "mock";
  process.env.MOCK_BANK_FAIL = "true";
  await shutdownTestServer();
  const { batchId } = await prepareAndLockBatch(99, "failure");
  await assertFailurePayouts("failure", batchId);
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runSuccessOnce(run);
  }
  await runFailureOnce();
  await shutdownTestServer();
  console.log("test-bank-auto1: all runs PASS (3× success + 1× failure)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
