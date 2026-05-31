/**
 * E2E-UAT-HAUL-1 API mirror — same flow as apps/web/e2e/uat-haul-smoke.spec.ts
 * Run 3x: npm run test:uat-haul1
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import * as workspaceRepo from "../src/repositories/workspaceMembershipsRepository";
import { toNum } from "../src/repositories/id";
import { closeTestHttpServer, ensureTestHttpServer } from "./lib/testHttpServer";

const MINE_A = 1;
const MINE_B = 2;
const QTY_TONS = 10;

let BASE = process.env.TEST_BASE_URL ?? "http://localhost:4000";

async function http(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, res };
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
    throw new Error(`verify failed for ${mobile}`);
  }
  return verify.json.data.access_token as string;
}

async function selectWorkspace(
  token: string,
  mineId: number,
  opts?: { cooperativeId?: number; membership_kind?: "OPERATIONAL" | "COMMUNITY" },
) {
  return http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      mine_id: mineId,
      cooperative_id: opts?.cooperativeId,
      membership_kind: opts?.membership_kind ?? "OPERATIONAL",
    }),
  });
}

async function pollJob(jobId: string, token: string) {
  for (let i = 0; i < 150; i++) {
    const r = await http(`/api/admin/jobs/${jobId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status !== 200 || !r.json.success) throw new Error(`poll ${jobId}: ${JSON.stringify(r.json)}`);
    const job = r.json.data.job as { status: string; error?: string; result?: unknown };
    if (job.status === "completed") return job;
    if (job.status === "failed") {
      throw new Error(typeof job.error === "string" ? job.error : JSON.stringify(job.error ?? "job_failed"));
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`poll timeout ${jobId}`);
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function cleanupPeriod(mineId: number) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const period_key = `${year}-${String(month).padStart(2, "0")}`;

  const batches = await prisma.settlement_batches.findMany({
    where: { mine_id: BigInt(mineId), period_start: periodStart },
    select: { id: true },
  });
  for (const b of batches) {
    await prisma.settlement_batch_approvals.deleteMany({ where: { settlement_batch_id: b.id } });
    await prisma.payment_payouts.deleteMany({ where: { settlement_batch_id: b.id } });
    await prisma.settlement_lines.deleteMany({ where: { batch_id: b.id } });
  }
  await prisma.settlement_batches.deleteMany({
    where: { mine_id: BigInt(mineId), period_start: periodStart },
  });

  const statements = await prisma.period_statements.findMany({
    where: { mine_id: BigInt(mineId), period_key },
  });
  for (const row of statements) {
    await prisma.period_statement_approvals.deleteMany({ where: { period_statement_id: row.id } });
    await prisma.period_statement_lines.deleteMany({ where: { period_statement_id: row.id } });
    await prisma.period_statements.delete({ where: { id: row.id } });
  }
}

async function runOnce(run: number) {
  await cleanupPeriod(MINE_A);

  const adminToken = await loginAs("09000000000");
  const employerToken = await loginAs("09000000007");
  const opsToken = await loginAs("09000000002");
  const coopOpToken = await loginAs("09000000111");
  const coopOpMineB = await loginAs("09000000112");

  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: MINE_A, quantity_tons: 1, material_type: "ORE" }),
  });
  assert(seed.status === 200 && seed.json.success && seed.json.data?.seeded, `run ${run}: seed`);

  await selectWorkspace(employerToken, MINE_A);
  const needRes = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}`, "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({
      village_id: 1,
      material_type: "ORE",
      quantity_tons: QTY_TONS,
      note: `uat-haul run ${run}`,
    }),
  });
  assert(needRes.status === 201 && needRes.json.success, `run ${run}: need ${JSON.stringify(needRes.json)}`);
  const needId = needRes.json.data.need.id as number;

  await selectWorkspace(opsToken, MINE_A);
  const dispatch = await http(`/api/admin/needs/${needId}/dispatch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opsToken}`, "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({}),
  });
  assert(dispatch.status === 200 && dispatch.json.success, `run ${run}: dispatch ${JSON.stringify(dispatch.json)}`);
  const firstAssignment = (dispatch.json.data.assignments as { mission_id: number; driver_id: number }[])[0]!;
  const missionId = firstAssignment.mission_id;

  const driverRow = await prisma.drivers.findUnique({
    where: { id: BigInt(firstAssignment.driver_id) },
    include: { user: true },
  });
  assert(driverRow?.user?.mobile_number, `run ${run}: driver mobile`);
  const coopId = driverRow.cooperative_id != null ? toNum(driverRow.cooperative_id) : 1;
  await workspaceRepo.upsertMembership({
    user_id: toNum(driverRow.user_id),
    mine_id: MINE_A,
    cooperative_id: coopId,
    role_in_workspace: "DRIVER",
    status: "ACTIVE",
  });
  const driverToken = await loginAs(driverRow.user.mobile_number);

  await selectWorkspace(driverToken, MINE_A, { cooperativeId: coopId });
  for (const step of ["ACCEPTED", "ARRIVED"] as const) {
    const body = step === "ARRIVED" ? { step, latitude: 27, longitude: 55 } : { step };
    const r = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}`, "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(body),
    });
    assert(r.status === 200 && r.json.success, `run ${run}: ${step}`);
  }

  const ticketRes = await http(`/api/driver/missions/${missionId}/ticket`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const ticketId = ticketRes.json?.data?.ticket?.id as number;
  assert(!!ticketId, `run ${run}: ticket`);

  await selectWorkspace(coopOpToken, MINE_A, { cooperativeId: 1, membership_kind: "COMMUNITY" });
  const loadedKg = 10000 + QTY_TONS * 1000;
  const weights = await http(`/api/weighbridge/tickets/${ticketId}/weights`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopOpToken}`, "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ empty_weight: 10000, loaded_weight: loadedKg }),
  });
  assert(weights.status === 200 && weights.json.success, `run ${run}: weights`);

  for (const step of ["LOADED", "IN_TRANSIT", "DELIVERED"] as const) {
    const body = step === "DELIVERED" ? { step, latitude: 27.05, longitude: 55.05 } : { step };
    const r = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}`, "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(body),
    });
    assert(r.status === 200 && r.json.success, `run ${run}: ${step}`);
  }

  const crossSel = await selectWorkspace(coopOpMineB, MINE_A, {
    cooperativeId: 1,
    membership_kind: "COMMUNITY",
  });
  assert(crossSel.status === 403, `run ${run}: cross workspace expected 403`);

  const mineBSelect = await selectWorkspace(coopOpMineB, MINE_B, {
    cooperativeId: 2,
    membership_kind: "COMMUNITY",
  });
  if (mineBSelect.status === 200) {
    const crossW = await http(`/api/weighbridge/tickets/${ticketId}/weights`, {
      method: "POST",
      headers: { Authorization: `Bearer ${coopOpMineB}`, "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ empty_weight: 9000, loaded_weight: 14000 }),
    });
    assert(crossW.status === 403, `run ${run}: cross weights expected 403, got ${crossW.status}`);
  }

  await selectWorkspace(opsToken, MINE_A, { membership_kind: "OPERATIONAL" });
  const approve = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opsToken}`, "Idempotency-Key": crypto.randomUUID() },
  });
  assert(
    approve.status === 200 && approve.json.success,
    `run ${run}: approve ${JSON.stringify(approve.json)}`,
  );
  assert(approve.json.data.mission.status === "VERIFIED", `run ${run}: VERIFIED`);

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  await selectWorkspace(opsToken, MINE_A, { membership_kind: "OPERATIONAL" });
  const close = await http("/api/admin/settlement/monthly-close", {
    method: "POST",
    headers: { Authorization: `Bearer ${opsToken}`, "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ mine_id: MINE_A, year, month }),
  });
  assert([200, 202].includes(close.status) && close.json.success, `run ${run}: close`);

  let batchId: number;
  if (close.status === 202) {
    const job = await pollJob(close.json.data.job_id as string, opsToken);
    const result = job.result as { ok: boolean; batch: { id: number } };
    assert(result.ok, `run ${run}: close job`);
    batchId = result.batch.id;
  } else {
    batchId = close.json.data.batch.id as number;
  }

  const batches = await http("/api/settlement/batches", {
    headers: { Authorization: `Bearer ${opsToken}` },
  });
  assert(
    batches.json.data.batches.some((b: { id: number }) => b.id === batchId),
    `run ${run}: batch visible`,
  );

  const exportGet = await fetch(
    `${BASE}/api/admin/settlement/${batchId}/export?sync=1&format=csv`,
    { headers: { Authorization: `Bearer ${opsToken}` } },
  );
  assert(exportGet.ok, `run ${run}: export csv`);
  const csv = await exportGet.text();
  assert(csv.length > 10, `run ${run}: csv empty`);

  const ps = await http(
    `/api/admin/finance/period-statements?mine_id=${MINE_A}&cooperative_id=1&year=${year}&month=${month}`,
    { headers: { Authorization: `Bearer ${adminToken}` } },
  );
  assert(ps.status === 200 && (ps.json.data?.statements?.length ?? 0) > 0, `run ${run}: period statements`);

  console.log(`UAT-HAUL-1 run ${run}: OK need=${needId} mission=${missionId} batch=${batchId}`);
}

async function main() {
  BASE = await ensureTestHttpServer();
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  console.log("UAT-HAUL-1: all 3 runs passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await closeTestHttpServer();
    await prisma.$disconnect();
  });
