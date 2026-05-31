/**
 * SET-1: Settlement lifecycle monthly-close → lock → send-to-bank → mark-paid.
 * Run 3x: npm run test:set1
 * Requires: DATABASE_URL, server on TEST_BASE_URL (optional HTTP), db:seed.
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { appContext } from "../src/appContext";
import {
  clearEventsForTests,
  initEventBus,
  publishEvent,
  listRecentEvents,
} from "../src/services/eventBus";
import * as settlementRepo from "../src/repositories/settlementRepository";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4000";

async function http(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function pollJobHttp(jobId: string, token: string) {
  for (let i = 0; i < 150; i++) {
    const r = await http(`/api/admin/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status !== 200 || !r.json.success) {
      throw new Error(`poll job ${jobId} failed: ${JSON.stringify(r.json)}`);
    }
    const job = r.json.data.job as { status: string; error?: string; result?: unknown };
    if (job.status === "completed") return job;
    if (job.status === "failed") throw new Error(job.error ?? "job_failed");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`poll timeout for job ${jobId}`);
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

async function verifyMissionFlow(
  adminToken: string,
  driverToken: string,
  coopOpToken: string,
  coopAdminToken: string,
  run: number,
) {
  const qty = 4 + run * 0.2;
  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: 1, quantity_tons: qty, material_type: "ORE" }),
  });
  if (seed.status !== 200 || !seed.json.success) {
    throw new Error(`run ${run}: seed failed ${JSON.stringify(seed.json)}`);
  }
  const missionId = seed.json.data.mission.id as number;

  const accept = await http(`/api/driver/missions/${missionId}/steps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ step: "ACCEPTED" }),
  });
  if (accept.status !== 200) throw new Error(`run ${run}: ACCEPTED failed`);

  const arrived = await http(`/api/driver/missions/${missionId}/steps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ step: "ARRIVED", latitude: 27.0, longitude: 55.0 }),
  });
  if (arrived.status !== 200) throw new Error(`run ${run}: ARRIVED failed`);

  const ticketRes = await http(`/api/driver/missions/${missionId}/ticket`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const ticketId = ticketRes.json?.data?.ticket?.id as number;
  if (!ticketId) throw new Error(`run ${run}: no ticket`);

  const weights = await http(`/api/weighbridge/tickets/${ticketId}/weights`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopOpToken}` },
    body: JSON.stringify({ empty_weight: 10000, loaded_weight: 10000 + qty * 1000 }),
  });
  if (weights.status !== 200 || !weights.json.success) {
    throw new Error(`run ${run}: weights failed ${JSON.stringify(weights.json)}`);
  }

  for (const step of ["LOADED", "IN_TRANSIT", "DELIVERED"] as const) {
    const body = step === "DELIVERED" ? { step, latitude: 27.05, longitude: 55.05 } : { step };
    const r = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify(body),
    });
    if (r.status !== 200 || !r.json.success) {
      throw new Error(`run ${run}: step ${step} failed ${JSON.stringify(r.json)}`);
    }
  }

  const opAdminToken = await loginAs("09000000002");
  const approve = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
  });
  if (approve.status !== 200 || !approve.json.success) {
    throw new Error(`run ${run}: approve failed ${JSON.stringify(approve.json)}`);
  }

  const mission = await prisma.missions.findUnique({ where: { id: BigInt(missionId) } });
  if (mission?.status !== "VERIFIED") {
    throw new Error(`run ${run}: mission expected VERIFIED, got ${mission?.status}`);
  }
  return missionId;
}

async function testEventBusInProcess(run: number) {
  initEventBus(appContext.auditStore);
  clearEventsForTests();
  const batch = await settlementRepo.createDraft({
    period_start: new Date(),
    period_end: new Date(),
    lines: [],
  });
  await prisma.settlement_batches.update({
    where: { id: BigInt(batch.batch.id) },
    data: { status: "READY_FOR_SETTLEMENT" },
  });
  const sent = await settlementRepo.sendToBank(batch.batch.id);
  if (!sent.ok) throw new Error(`run ${run}: sendToBank unit failed`);
  if (!listRecentEvents(10).some((e) => e.event_name === "settlement.in_bank_queue")) {
    throw new Error(`run ${run}: settlement.in_bank_queue event missing (in-process)`);
  }
  publishEvent("settlement.failed", { batch_id: batch.batch.id, reason: "test", manual_review: true });
  await prisma.settlement_batches.delete({ where: { id: BigInt(batch.batch.id) } });
}

async function runOnce(run: number) {
  clearEventsForTests();
  await testEventBusInProcess(run);

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const batches = await prisma.settlement_batches.findMany({
    where: {
      mine_id: BigInt(1),
      period_start: new Date(Date.UTC(year, month - 1, 1)),
    },
    select: { id: true },
  });
  for (const b of batches) {
    await prisma.settlement_batch_approvals.deleteMany({ where: { settlement_batch_id: b.id } });
  }
  await prisma.settlement_batches.deleteMany({
    where: {
      mine_id: BigInt(1),
      period_start: new Date(Date.UTC(year, month - 1, 1)),
    },
  });
  const period_key = `${year}-${String(month).padStart(2, "0")}`;
  const statements = await prisma.period_statements.findMany({
    where: { mine_id: BigInt(1), period_key },
  });
  for (const row of statements) {
    await prisma.period_statement_approvals.deleteMany({ where: { period_statement_id: row.id } });
    await prisma.period_statement_lines.deleteMany({ where: { period_statement_id: row.id } });
    await prisma.period_statements.delete({ where: { id: row.id } });
  }

  let adminToken: string | null = null;
  try {
    adminToken = await loginAs("09000000000");
  } catch {
    console.log(`run ${run}: HTTP auth skipped (server down?) — DB-only checks limited`);
  }

  if (adminToken) {
    const driverToken = await loginAs("09000000003");
    const coopOpToken = await loginAs("09000000111");
    const coopAdminToken = await loginAs("09000000001");
    await selectWorkspace(driverToken, 1);
    await selectWorkspace(coopOpToken, 1);
    await selectWorkspace(coopAdminToken, 1);
    await verifyMissionFlow(adminToken, driverToken, coopOpToken, coopAdminToken, run);

    const opAdminToken = await loginAs("09000000002");
    const opLockerToken = await loginAs("09000000103");
    await selectWorkspace(opAdminToken, 1);
    await selectWorkspace(opLockerToken, 1);
    await selectWorkspace(coopAdminToken, 1, "COMMUNITY");

    const shortRef = await http("/api/admin/settlement/1/mark-paid", {
      method: "POST",
      headers: { Authorization: `Bearer ${opAdminToken}` },
      body: JSON.stringify({
        payment_reference: "short",
        receipt_file_url: "https://example.com/r.pdf",
      }),
    });
    if (shortRef.status !== 400) {
      throw new Error(`run ${run}: expected 400 for short payment_reference, got ${shortRef.status}`);
    }

    const close = await http("/api/admin/settlement/monthly-close", {
      method: "POST",
      headers: { Authorization: `Bearer ${opAdminToken}` },
      body: JSON.stringify({ mine_id: 1, year, month }),
    });
    if (close.status !== 202 || !close.json.success) {
      throw new Error(`run ${run}: monthly-close expected 202 ${JSON.stringify(close.json)}`);
    }
    const closeJobId = close.json.data.job_id as string;
    const closeJob = await pollJobHttp(closeJobId, opAdminToken);
    const closeResult = closeJob.result as { ok: boolean; batch: { id: number; status: string } };
    if (!closeResult?.ok) {
      throw new Error(`run ${run}: monthly-close job failed`);
    }
    const batchId = closeResult.batch.id;
    if (closeResult.batch.status !== "CALCULATED") {
      throw new Error(`run ${run}: expected CALCULATED, got ${closeResult.batch.status}`);
    }

    const coopAp = await http(`/api/admin/settlement/${batchId}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${coopAdminToken}` },
    });
    if (coopAp.status !== 200) throw new Error(`run ${run}: coop approve failed`);

    const opAp = await http(`/api/admin/settlement/${batchId}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opAdminToken}` },
    });
    if (opAp.status !== 200) throw new Error(`run ${run}: op approve failed`);

    const lock = await http(`/api/admin/settlement/${batchId}/lock`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opLockerToken}` },
    });
    if (lock.status !== 200 || lock.json.data.batch.status !== "READY_FOR_SETTLEMENT") {
      throw new Error(`run ${run}: lock failed`);
    }

    const bank = await http(`/api/admin/settlement/${batchId}/send-to-bank`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opAdminToken}` },
    });
    if (bank.status !== 200 || bank.json.data.batch.status !== "IN_BANK_QUEUE") {
      throw new Error(`run ${run}: send-to-bank failed`);
    }

    const paid = await http(`/api/admin/settlement/${batchId}/mark-paid`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opAdminToken}` },
      body: JSON.stringify({
        payment_reference: `BANKREF${run}00000001`,
        receipt_file_url: "https://storage.example.com/receipts/set1.pdf",
      }),
    });
    if (paid.status !== 200 || paid.json.data.batch.status !== "SETTLED") {
      throw new Error(`run ${run}: mark-paid failed ${JSON.stringify(paid.json)}`);
    }

    const lineCount = await prisma.settlement_lines.count({ where: { batch_id: BigInt(batchId) } });
    const payoutCount = await prisma.payment_payouts.count({ where: { settlement_batch_id: BigInt(batchId) } });
    if (lineCount > 0 && payoutCount !== lineCount) {
      throw new Error(`run ${run}: payouts ${payoutCount} !== lines ${lineCount}`);
    }

    const exportQueued = await http(`/api/admin/settlement/${batchId}/export`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opAdminToken}` },
      body: JSON.stringify({}),
    });
    if (exportQueued.status !== 202 || !exportQueued.json.success) {
      throw new Error(`run ${run}: export queue failed ${JSON.stringify(exportQueued.json)}`);
    }
    const exportJob = await pollJobHttp(exportQueued.json.data.job_id as string, opAdminToken);
    const exportResult = exportJob.result as { csv?: string };
    const csv = exportResult?.csv ?? "";
    if (!csv.includes("payee_type") || !csv.includes("INTERNAL_FLEET_OWNER") || !csv.includes("BANKREF")) {
      throw new Error(`run ${run}: export CSV missing expected columns/ref`);
    }

    const linesWithMissions = await prisma.settlement_lines.findMany({
      where: { batch_id: BigInt(batchId), mission_id: { not: null } },
    });
    for (const line of linesWithMissions) {
      const m = await prisma.missions.findUnique({ where: { id: line.mission_id! } });
      if (m?.status !== "SETTLED") {
        throw new Error(`run ${run}: mission ${line.mission_id} should be SETTLED`);
      }
    }

    console.log(`run ${run}: HTTP lifecycle OK — batch ${batchId}, lines=${lineCount}, payouts=${payoutCount}`);
  } else {
    console.log(`run ${run}: skipped HTTP (no server)`);
  }
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  console.log("test:set1 — all 3 runs passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
