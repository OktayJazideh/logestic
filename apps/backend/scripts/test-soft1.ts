/**
 * SOFT-1: deleted_at columns, Prisma soft-delete filter, admin restore/soft-delete, audit.
 * Run 3x: npm run test:soft1
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { prisma } from "../src/db/prisma";
import { runWithSoftDeleteBypass } from "../src/lib/softDelete";
import * as rateCardsRepo from "../src/repositories/rateCardsRepository";
import * as auditRepo from "../src/repositories/auditLogsRepository";
import { hardDeleteEntityForTests } from "../src/services/softDeleteService";

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

async function runOnce(run: number) {
  const admin = await prisma.users.findFirst({ where: { mobile_number: "09000000000" } });
  assert(admin != null, `run ${run}: seed admin user required`);
  const adminId = Number(admin.id);

  const card = await rateCardsRepo.createDraftRateCard({
    mine_id: 1,
    operation_type: "TONNAGE",
    material_type: `SOFT_TEST_${run}_${Date.now()}`,
    unit_type: "TON",
    rate: 9999 + run,
    effective_from: new Date("2099-01-01"),
    created_by: adminId,
  });

  const visibleBefore = await rateCardsRepo.getRateCardById(card.id);
  assert(visibleBefore != null, `run ${run}: draft rate card should exist before delete`);

  const token = await loginAs("09000000000");

  const softDel = await http("/api/admin/soft-delete", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      entity_type: "rate_card",
      entity_id: String(card.id),
      reason: `soft1 test run ${run}`,
    }),
  });
  assert(softDel.status === 200 && softDel.json.success, `run ${run}: soft-delete failed: ${JSON.stringify(softDel.json)}`);

  const hiddenAfter = await rateCardsRepo.getRateCardById(card.id);
  assert(hiddenAfter == null, `run ${run}: soft-deleted rate card must be hidden from queries`);

  const bypassRow = await runWithSoftDeleteBypass(() =>
    prisma.rate_cards.findUnique({ where: { id: BigInt(card.id) } }),
  );
  assert(bypassRow?.deleted_at != null, `run ${run}: deleted_at must be set in DB`);

  const logsAfterDelete = await auditRepo.listAuditLogsByEntity("rate_card", String(card.id));
  assert(
    logsAfterDelete.some((l) => l.action === "SOFT_DELETED"),
    `run ${run}: SOFT_DELETED audit missing`,
  );

  const restore = await http("/api/admin/restore", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      entity_type: "rate_card",
      entity_id: String(card.id),
      reason: `soft1 restore run ${run}`,
    }),
  });
  assert(restore.status === 200 && restore.json.success, `run ${run}: restore failed: ${JSON.stringify(restore.json)}`);

  const visibleAfter = await rateCardsRepo.getRateCardById(card.id);
  assert(visibleAfter != null, `run ${run}: restored rate card must be visible`);

  const doubleRestore = await http("/api/admin/restore", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      entity_type: "rate_card",
      entity_id: String(card.id),
      reason: "double",
    }),
  });
  assert(doubleRestore.status === 409, `run ${run}: double restore must be 409`);

  const logsAfterRestore = await auditRepo.listAuditLogsByEntity("rate_card", String(card.id));
  assert(logsAfterRestore.some((l) => l.action === "RESTORED"), `run ${run}: RESTORED audit missing`);

  // Prisma delete() must soft-delete, not hard-delete
  await prisma.rate_cards.delete({ where: { id: BigInt(card.id) } });
  const stillInDb = await runWithSoftDeleteBypass(() =>
    prisma.rate_cards.findUnique({ where: { id: BigInt(card.id) } }),
  );
  assert(stillInDb != null && stillInDb.deleted_at != null, `run ${run}: prisma.delete must soft-delete`);

  await hardDeleteEntityForTests("rate_cards", card.id);
  const gone = await runWithSoftDeleteBypass(() =>
    prisma.rate_cards.findUnique({ where: { id: BigInt(card.id) } }),
  );
  assert(gone == null, `run ${run}: test cleanup hard delete failed`);

  console.log(`run ${run}: OK`);
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  if (testServer) {
    await new Promise<void>((resolve) => testServer!.close(() => resolve()));
  }
  console.log("test-soft1: all 3 runs passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
