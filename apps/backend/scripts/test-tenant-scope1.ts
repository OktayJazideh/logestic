/**
 * TENANT-SCOPE-1: settlement/admin/wallet mine isolation (3 runs).
 * Run: npm run test:tenant-scope1
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { prisma } from "../src/db/prisma";
import * as settlementRepo from "../src/repositories/settlementRepository";
import * as workspaceRepo from "../src/repositories/workspaceMembershipsRepository";

let testServer: Server | null = null;
let baseUrl = "";

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

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function selectWorkspace(
  token: string,
  mineId: number,
  membershipKind: "OPERATIONAL" | "COMMUNITY" = "OPERATIONAL",
) {
  const r = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: mineId, membership_kind: membershipKind }),
  });
  return r;
}

async function seedBatches(run: number) {
  const now = new Date();
  const start = new Date(now.getTime() - 86400000);
  const end = new Date(now.getTime() + 86400000);

  const batchA = await settlementRepo.createDraft({
    mine_id: 1,
    period_start: start,
    period_end: end,
    lines: [],
  });
  const batchB = await settlementRepo.createDraft({
    mine_id: 2,
    period_start: start,
    period_end: end,
    lines: [],
  });

  await prisma.settlement_batches.update({
    where: { id: BigInt(batchA.batch.id) },
    data: { status: "CALCULATED" },
  });
  await prisma.settlement_batches.update({
    where: { id: BigInt(batchB.batch.id) },
    data: { status: "CALCULATED" },
  });

  return { batchAId: batchA.batch.id, batchBId: batchB.batch.id, tag: run };
}

async function cleanupBatches(ids: number[]) {
  for (const id of ids) {
    await prisma.settlement_batch_approvals.deleteMany({ where: { settlement_batch_id: BigInt(id) } });
    await prisma.settlement_lines.deleteMany({ where: { batch_id: BigInt(id) } });
    await prisma.settlement_batches.deleteMany({ where: { id: BigInt(id) } });
  }
}

async function runOnce(run: number) {
  await appContext.mineData.hydrate();

  const opUser = await appContext.userStore.upsertUserByMobile("09000000002", "OPERATION_ADMIN", {
    is_active: true,
  });
  await workspaceRepo.upsertMembership({
    user_id: opUser.id,
    mine_id: 1,
    role_in_workspace: "OPERATION_ADMIN",
    status: "ACTIVE",
  });

  const { batchAId, batchBId } = await seedBatches(run);

  const opToken = await loginAs("09000000002");
  const selectA = await selectWorkspace(opToken, 1);
  assert(selectA.status === 200 && selectA.json.success, `run ${run}: select mine A failed`);

  const listA = await http("/api/settlement/batches", {
    headers: { Authorization: `Bearer ${opToken}` },
  });
  assert(listA.status === 200 && listA.json.success, `run ${run}: list batches failed`);
  const batches = listA.json.data.batches as Array<{ id: number; mine_id?: number }>;
  assert(batches.every((b) => b.mine_id === 1), `run ${run}: list must only return mine A batches`);
  assert(
    batches.some((b) => b.id === batchAId) && !batches.some((b) => b.id === batchBId),
    `run ${run}: batch A visible, batch B hidden`,
  );

  const crossQuery = await http("/api/settlement/batches?mine_id=2", {
    headers: { Authorization: `Bearer ${opToken}` },
  });
  assert(
    crossQuery.status === 403 && crossQuery.json?.error?.code === "mine_mismatch",
    `run ${run}: query mine B must be 403 mine_mismatch`,
  );

  const now = new Date();
  const closeB = await http("/api/admin/settlement/monthly-close", {
    method: "POST",
    headers: { Authorization: `Bearer ${opToken}` },
    body: JSON.stringify({
      mine_id: 2,
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
    }),
  });
  assert(
    closeB.status === 403 && closeB.json?.error?.code === "mine_mismatch",
    `run ${run}: monthly-close mine B must be 403`,
  );

  const noMine = await loginAs("09000000002");
  const noCtx = await http("/api/settlement/batches", {
    headers: { Authorization: `Bearer ${noMine}` },
  });
  assert(
    noCtx.status === 400 && noCtx.json?.error?.code === "mine_not_selected",
    `run ${run}: without workspace must be 400 mine_not_selected`,
  );

  await cleanupBatches([batchAId, batchBId]);

  // eslint-disable-next-line no-console
  console.log(`TENANT-SCOPE-1 run ${run} OK`);
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  // eslint-disable-next-line no-console
  console.log("TENANT-SCOPE-1: all 3 cross-mine scenarios passed");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    if (testServer) {
      testServer.close();
    }
  });
