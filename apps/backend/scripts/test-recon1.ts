/**
 * RECON-1: wallet ↔ ledger ↔ settlement ↔ pool reconciliation.
 * Run 3x: npm run test:recon1
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { reconciliationService } from "../src/services/reconciliationService";
import * as reconciliationRepo from "../src/repositories/reconciliationRepository";
import { jobQueue } from "../src/queues/jobQueue";
import {
  clearReconciliationIssuesForTests,
  getLastReconciliationIssues,
} from "../src/queues/handlers/reconciliationJobs";
import { toDecimal } from "../src/repositories/decimal";
import { closeTestHttpServer, ensureTestHttpServer } from "./lib/testHttpServer";

let BASE = process.env.TEST_BASE_URL ?? "http://localhost:4000";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function http(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
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
    throw new Error(`verify failed: ${JSON.stringify(verify.json)}`);
  }
  return verify.json.data.access_token as string;
}

function settlementPeriodDates(run: number): { period_start: Date; period_end: Date } {
  const month = ((run - 1) % 12) + 1;
  const year = 2097 + Math.floor((run - 1) / 12);
  const mm = String(month).padStart(2, "0");
  return {
    period_start: new Date(`${year}-${mm}-01`),
    period_end: new Date(`${year}-${mm}-28`),
  };
}

async function seedSettlementMismatch(run: number) {
  const { period_start, period_end } = settlementPeriodDates(run);
  const batch = await prisma.settlement_batches.create({
    data: {
      mine_id: BigInt(1),
      period_start,
      period_end,
      status: "SETTLED",
      paid_at: new Date(),
    },
  });
  const wallet = await prisma.wallets.findFirst({ where: { wallet_type: "OWNER" } });
  if (!wallet) throw new Error("no owner wallet for settlement test");

  const line1 = await prisma.settlement_lines.create({
    data: { batch_id: batch.id, wallet_id: wallet.id, amount: toDecimal(100) },
  });
  await prisma.settlement_lines.create({
    data: { batch_id: batch.id, wallet_id: wallet.id, amount: toDecimal(200) },
  });
  await prisma.payment_payouts.create({
    data: {
      settlement_batch_id: batch.id,
      settlement_line_id: line1.id,
      status: "COMPLETED",
      completed_at: new Date(),
    },
  });
  return Number(batch.id);
}

async function seedPoolMismatch(run: number) {
  const pool = await prisma.community_pools.create({
    data: {
      mine_id: BigInt(1),
      period_key: `recon-test-${run}-${Date.now()}`,
      total_amount: toDecimal(1000),
      status: "OPEN",
    },
  });
  const wallet = await prisma.wallets.findFirst({ where: { wallet_type: "HOUSEHOLD" } });
  if (!wallet) throw new Error("no household wallet for pool test");

  const tx = await prisma.transactions.create({
    data: {
      wallet_id: wallet.id,
      community_pool_id: pool.id,
      amount: toDecimal(500),
      type: "POOL_DISTRIBUTION",
      description: `recon-test-${run}`,
    },
  });
  return { poolId: Number(pool.id), txId: Number(tx.id) };
}

async function cleanupSettlementBatch(batchId: number) {
  await prisma.payment_payouts.deleteMany({ where: { settlement_batch_id: BigInt(batchId) } });
  await prisma.settlement_lines.deleteMany({ where: { batch_id: BigInt(batchId) } });
  await prisma.settlement_batches.delete({ where: { id: BigInt(batchId) } }).catch(() => {});
}

async function cleanupPoolTest(poolId: number, txId: number) {
  await prisma.transactions.delete({ where: { id: BigInt(txId) } }).catch(() => {});
  await prisma.community_pools.delete({ where: { id: BigInt(poolId) } }).catch(() => {});
}

async function testServiceRun(run: number) {
  await reconciliationRepo.deleteAllIssuesForTests();
  const batchId = await seedSettlementMismatch(run);
  const { poolId, txId } = await seedPoolMismatch(run);

  const result = await reconciliationService.runReconciliation();
  assert(result.issue_count >= 2, `run ${run}: expected >=2 issues, got ${result.issue_count}`);

  const codes = new Set(result.issues.map((i) => i.code));
  assert(codes.has("settlement_payout_mismatch"), `run ${run}: missing settlement_payout_mismatch`);
  assert(codes.has("pool_not_distributed"), `run ${run}: missing pool_not_distributed`);

  const open = await reconciliationRepo.listIssues({ status: "OPEN" });
  assert(open.length >= 2, `run ${run}: expected persisted open issues`);

  const admin = await prisma.users.findFirst({ where: { mobile_number: "09000000000" } });
  if (!admin) throw new Error("admin user missing");
  const issueToResolve = open.find((i) => i.code === "pool_not_distributed");
  assert(issueToResolve != null, `run ${run}: no pool issue to resolve`);
  const resolved = await reconciliationRepo.resolveIssue(
    issueToResolve.id,
    Number(admin.id),
    `test-resolve-run-${run}`,
  );
  assert(resolved?.status === "RESOLVED", `run ${run}: resolve failed`);
  assert(resolved?.resolve_reason === `test-resolve-run-${run}`, `run ${run}: resolve reason mismatch`);

  await cleanupSettlementBatch(batchId);
  await cleanupPoolTest(poolId, txId);
  await reconciliationRepo.deleteAllIssuesForTests();
}

async function testQueueHandler(run: number) {
  jobQueue.resetForTests();
  await clearReconciliationIssuesForTests();
  const job = await jobQueue.enqueue("reconciliation", "nightly-run", { run }, { wait: true });
  assert(job.status === "completed", `run ${run}: queue reconciliation failed: ${job.error}`);
  const issues = await getLastReconciliationIssues();
  assert(Array.isArray(issues), `run ${run}: getLastReconciliationIssues not array`);
}

async function testHttpApi(run: number) {
  const adminToken = await loginAs("09000000000");
  const headers = { Authorization: `Bearer ${adminToken}` };

  await reconciliationRepo.deleteAllIssuesForTests();
  const batchId = await seedSettlementMismatch(run + 100);

  await reconciliationService.runReconciliation();

  const list = await http("/api/admin/reconciliation/issues?status=OPEN", { headers });
  if (list.status !== 200 || !list.json.success) {
    throw new Error(`run ${run}: GET issues failed ${JSON.stringify(list.json)}`);
  }
  const issues = list.json.data.issues as Array<{ id: number; code: string; status: string }>;
  assert(issues.length >= 1, `run ${run}: HTTP list empty`);

  const target = issues.find((i) => i.code === "settlement_payout_mismatch");
  assert(target != null, `run ${run}: settlement issue not in HTTP list`);

  const resolve = await http(`/api/admin/reconciliation/issues/${target.id}/resolve`, {
    method: "POST",
    headers,
    body: JSON.stringify({ reason: `http-resolve-${run}` }),
  });
  if (resolve.status !== 200 || !resolve.json.success) {
    throw new Error(`run ${run}: resolve HTTP failed ${JSON.stringify(resolve.json)}`);
  }
  assert(resolve.json.data.issue.status === "RESOLVED", `run ${run}: resolve status not RESOLVED`);

  await cleanupSettlementBatch(batchId);
  await reconciliationRepo.deleteAllIssuesForTests();
}

async function runOnce(run: number) {
  await testServiceRun(run);
  await testQueueHandler(run);
  await testHttpApi(run);
  console.log(`RECON-1 run ${run}: OK`);
}

async function main() {
  BASE = await ensureTestHttpServer();
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  console.log("test:recon1 — all 3 runs passed");
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
