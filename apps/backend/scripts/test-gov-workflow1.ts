/**
 * GOV-WORKFLOW-1: dual settlement approve + maker/checker lock, permissions, weighbridge roles.
 * Run 3x: npm run test:gov-workflow1
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { prisma } from "../src/db/prisma";
import { toBig } from "../src/repositories/id";
import { hasPermission } from "../src/types/permissions";

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

async function selectWorkspace(token: string, mineId: number, membershipKind?: "OPERATIONAL" | "COMMUNITY") {
  const r = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: mineId, ...(membershipKind ? { membership_kind: membershipKind } : {}) }),
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

async function pollJob(jobId: string, token: string) {
  for (let i = 0; i < 120; i++) {
    const r = await http(`/api/admin/jobs/${jobId}`, { headers: { Authorization: `Bearer ${token}` } });
    const job = r.json?.data?.job as { status: string; result?: { ok?: boolean; batch?: { id: number } }; error?: string };
    if (job?.status === "completed") return job;
    if (job?.status === "failed") throw new Error(job.error ?? "job_failed");
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error("job poll timeout");
}

async function cleanupSettlementBatch(mineId: number, year: number, month: number) {
  const period_start = new Date(Date.UTC(year, month - 1, 1));
  const batches = await prisma.settlement_batches.findMany({
    where: { mine_id: toBig(mineId), period_start },
    select: { id: true },
  });
  for (const b of batches) {
    await prisma.settlement_batch_approvals.deleteMany({ where: { settlement_batch_id: b.id } });
    await prisma.payment_payouts.deleteMany({ where: { settlement_batch_id: b.id } });
    await prisma.settlement_lines.deleteMany({ where: { batch_id: b.id } });
    await prisma.period_statements.updateMany({
      where: { settlement_batch_id: b.id },
      data: { settlement_batch_id: null },
    });
    await prisma.settlement_batches.delete({ where: { id: b.id } });
  }
}

async function runOnce(run: number) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  await cleanupSettlementBatch(1, year, month);

  const adminToken = await loginAs("09000000000");
  const coopAdminToken = await loginAs("09000000001");
  const opAdminToken = await loginAs("09000000002");
  const opLockerToken = await loginAs("09000000103");
  const consultantToken = await loginAs("09000000006");
  const coopOpToken = await loginAs("09000000111");

  await selectWorkspace(opAdminToken, 1);
  await selectWorkspace(opLockerToken, 1);
  await selectWorkspace(coopAdminToken, 1, "COMMUNITY");

  const close = await http("/api/admin/settlement/monthly-close", {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
    body: JSON.stringify({ mine_id: 1, year, month, wait: true }),
  });
  if (close.status === 409 && close.json?.error?.code === "batch_exists_for_period") {
    await cleanupSettlementBatch(1, year, month);
    const retry = await http("/api/admin/settlement/monthly-close", {
      method: "POST",
      headers: { Authorization: `Bearer ${opAdminToken}` },
      body: JSON.stringify({ mine_id: 1, year, month, wait: true }),
    });
    assert(retry.status === 200 && retry.json.success, `run ${run}: monthly-close retry ${JSON.stringify(retry.json)}`);
    close.status = retry.status;
    close.json = retry.json;
  }
  assert(close.status === 200 && close.json.success, `run ${run}: monthly-close ${JSON.stringify(close.json)}`);
  const batchId = close.json.data.batch.id as number;

  const adminLock = await http(`/api/admin/settlement/${batchId}/lock`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(adminLock.status === 403, `run ${run}: ADMIN lock must be 403`);

  const lockNoApprove = await http(`/api/admin/settlement/${batchId}/lock`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opLockerToken}` },
  });
  assert(
    lockNoApprove.status === 409 && lockNoApprove.json?.error?.code === "dual_approval_required",
    `run ${run}: lock without approve must be dual_approval_required`,
  );

  const coopApprove = await http(`/api/admin/settlement/${batchId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopAdminToken}` },
  });
  assert(coopApprove.status === 200, `run ${run}: coop approve`);

  const opApprove = await http(`/api/admin/settlement/${batchId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
  });
  assert(opApprove.status === 200, `run ${run}: op approve`);

  const makerChecker = await http(`/api/admin/settlement/${batchId}/lock`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
  });
  assert(
    makerChecker.status === 409 && makerChecker.json?.error?.code === "maker_checker_same_user",
    `run ${run}: approver cannot lock`,
  );

  const lockOk = await http(`/api/admin/settlement/${batchId}/lock`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opLockerToken}` },
  });
  assert(lockOk.status === 200 && lockOk.json.data.batch.status === "READY_FOR_SETTLEMENT", `run ${run}: lock OK`);

  const auditLock = await prisma.audit_logs.findFirst({
    where: { entity_type: "settlement_batch", entity_id: String(batchId), action: "SETTLEMENT_BATCH_LOCKED" },
  });
  assert(!!auditLock, `run ${run}: settlement lock audit missing`);

  const driverToken = await loginAs("09000000003");
  await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ mine_id: 1 }),
  });
  await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${coopOpToken}` },
    body: JSON.stringify({ mine_id: 1 }),
  });

  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: 1, quantity_tons: 3 + run * 0.1, material_type: "ORE" }),
  });
  assert(seed.status === 200, `run ${run}: seed`);
  const missionId = seed.json.data.mission.id as number;
  const ticketRes = await http(`/api/driver/missions/${missionId}/ticket`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const ticketId = ticketRes.json?.data?.ticket?.id as number;
  assert(ticketId != null, `run ${run}: ticket`);

  for (const step of ["ACCEPTED", "ARRIVED", "LOADED", "IN_TRANSIT", "DELIVERED"] as const) {
    const body =
      step === "ARRIVED"
        ? { step, latitude: 27, longitude: 55 }
        : step === "DELIVERED"
          ? { step, latitude: 27.05, longitude: 55.05 }
          : { step };
    const st = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify(body),
    });
    assert(st.status === 200, `run ${run}: step ${step}`);
  }

  await http(`/api/weighbridge/tickets/${ticketId}/weights`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopOpToken}` },
    body: JSON.stringify({ empty_weight: 10000, loaded_weight: 13000 }),
  });

  const coopAdminWb = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopAdminToken}` },
  });
  assert(coopAdminWb.status === 403, `run ${run}: COOP_ADMIN wb approve forbidden`);

  const consultantWb = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${consultantToken}` },
  });
  assert(consultantWb.status === 403, `run ${run}: CONSULTANT wb approve forbidden`);

  const adminWb = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(adminWb.status === 403, `run ${run}: ADMIN wb approve forbidden`);

  const opWb = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
  });
  assert(opWb.status === 200 && opWb.json.success, `run ${run}: OPERATION_ADMIN wb approve`);

  const failBatch = await prisma.settlement_batches.create({
    data: {
      mine_id: toBig(1),
      period_start: new Date(Date.UTC(2099, 0, 1)),
      period_end: new Date(Date.UTC(2099, 0, 28)),
      status: "IN_BANK_QUEUE",
    },
  });
  const failRes = await http(`/api/admin/settlement/${failBatch.id}/mark-failed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
    body: JSON.stringify({ reason: "تست OVERRIDE GOV-WORKFLOW-1" }),
  });
  assert(failRes.status === 200, `run ${run}: mark-failed`);
  const overrideAudit = await prisma.audit_logs.findFirst({
    where: {
      entity_type: "settlement_batch",
      entity_id: String(failBatch.id),
      action: "OVERRIDE",
    },
  });
  assert(!!overrideAudit, `run ${run}: OVERRIDE audit on mark-failed`);
  await prisma.settlement_batches.delete({ where: { id: failBatch.id } });

  console.log(`run ${run}: PASS batch=${batchId} ticket=${ticketId}`);
}

async function dbReady(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    assert(!hasPermission("ADMIN", "settlement:lock"), `run ${run}: ADMIN must not lock`);
    assert(hasPermission("OPERATION_ADMIN", "settlement:lock"), `run ${run}: OP lock`);
  }
  console.log("permission matrix: OK (3×)");

  if (!(await dbReady())) {
    throw new Error(
      "DATABASE_URL unreachable (localhost:5434). Start: docker compose up -d && npm run db:migrate && npm run db:seed",
    );
  }

  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  if (testServer) {
    await new Promise<void>((resolve) => testServer!.close(() => resolve()));
  }
  console.log("test-gov-workflow1: all 3 runs PASS");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
