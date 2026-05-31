/**
 * AUDIT-1: persistent audit_logs + GET /api/audit + coop scope.
 * Run 3x: npm run test:audit1
 * Requires: DATABASE_URL, db:migrate, db:seed (starts in-process server on random port).
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { prisma } from "../src/db/prisma";
import { toBig, toNum } from "../src/repositories/id";
import * as auditRepo from "../src/repositories/auditLogsRepository";
import { buildCoopScopedAuditWhere } from "../src/lib/auditCoopScope";

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

type AuditLogDto = {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
};

async function seedHouseholdAudit(run: number, coopId: number): Promise<string> {
  const uniq = String(process.hrtime.bigint() % 100000n).padStart(5, "0");
  const mobile = `09${String(coopId).padStart(2, "0")}${String(run).padStart(2, "0")}${uniq}`;
  const user = await appContext.userStore.upsertUserByMobile(mobile, "HOUSEHOLD", { is_active: true });
  const village = await prisma.villages.findFirst();
  assert(village != null, "village seed required");
  const nationalId = `AUD${coopId}R${run}${Date.now()}`.slice(0, 20);
  const hh = await prisma.households.create({
    data: {
      user_id: toBig(user.id),
      village_id: village.id,
      cooperative_id: toBig(coopId),
      head_name: `Audit HH ${run}`,
      national_id: nationalId,
      status: "APPROVED",
    },
  });
  const entityId = String(toNum(hh.id));
  await appContext.auditStore.record({
    entity_type: "household",
    entity_id: entityId,
    action: "kyc_change",
    before_value: { status: "PENDING", cooperative_id: coopId },
    after_value: { status: "APPROVED", cooperative_id: coopId },
    performed_by_user_id: 1,
    reason: `audit1 run ${run} coop ${coopId}`,
  });
  return entityId;
}

async function testRepositoryScope(run: number, entityCoop1: string, entityCoop2: string) {
  const scope1 = await buildCoopScopedAuditWhere(1);
  const scoped1 = await auditRepo.queryAuditLogs({
    scopeWhere: scope1,
    entity_id: entityCoop1,
    limit: 10,
    offset: 0,
  });
  assert(
    scoped1.items.some((l) => l.entity_id === entityCoop1),
    `run ${run}: repo scope coop1`,
  );

  const scoped1Other = await auditRepo.queryAuditLogs({
    scopeWhere: scope1,
    entity_id: entityCoop2,
    limit: 10,
    offset: 0,
  });
  assert(
    !scoped1Other.items.some((l) => l.entity_id === entityCoop2),
    `run ${run}: repo scope coop1 must not see coop2 entity`,
  );
}

async function runOnce(run: number) {
  const adminToken = await loginAs("09000000000");
  const coop1Token = await loginAs("09000000001");
  const coop2Token = await loginAs("09000000102");

  const entityCoop1 = await seedHouseholdAudit(run, 1);
  const entityCoop2 = await seedHouseholdAudit(run, 2);

  await testRepositoryScope(run, entityCoop1, entityCoop2);

  const adminRes = await http(`/api/audit?entity_id=${entityCoop1}&limit=10`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(adminRes.status === 200 && adminRes.json.success, `run ${run}: admin audit failed`);
  const adminLogs = adminRes.json.data.logs as AuditLogDto[];
  assert(
    adminLogs.some((l) => l.entity_id === entityCoop1 && l.action === "kyc_change"),
    `run ${run}: admin should see coop1 audit`,
  );

  const bareAudit = await http("/api/audit?limit=5", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(bareAudit.status === 200, `run ${run}: audit without filters should default limit`);

  const coop1Res = await http(`/api/audit?entity_id=${entityCoop1}&limit=10`, {
    headers: { Authorization: `Bearer ${coop1Token}` },
  });
  assert(coop1Res.status === 200 && coop1Res.json.success, `run ${run}: coop1 audit failed`);
  const coop1Logs = coop1Res.json.data.logs as AuditLogDto[];
  assert(
    coop1Logs.some((l) => l.entity_id === entityCoop1),
    `run ${run}: coop1 admin should see own coop audit`,
  );

  const coop1Other = await http(`/api/audit?entity_id=${entityCoop2}&limit=10`, {
    headers: { Authorization: `Bearer ${coop1Token}` },
  });
  assert(coop1Other.status === 200, `run ${run}: coop1 query coop2 entity status`);
  const coop1OtherLogs = coop1Other.json.data.logs as AuditLogDto[];
  assert(
    !coop1OtherLogs.some((l) => l.entity_id === entityCoop2),
    `run ${run}: coop1 must not see coop2 scoped audit`,
  );

  const coop2Res = await http(`/api/audit?entity_id=${entityCoop2}&limit=10`, {
    headers: { Authorization: `Bearer ${coop2Token}` },
  });
  assert(
    (coop2Res.json.data.logs as AuditLogDto[]).some((l) => l.entity_id === entityCoop2),
    `run ${run}: coop2 should see coop2 audit`,
  );

  const filterUser = await http("/api/audit?user_id=1&entity_type=household&limit=5", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(filterUser.status === 200, `run ${run}: user filter failed`);
  assert(typeof filterUser.json.data.total === "number", `run ${run}: total missing`);

  const driverToken = await loginAs("09000000003");
  const forbidden = await http("/api/audit?limit=1", {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  assert(forbidden.status === 403, `run ${run}: driver should be forbidden`);

  const dbRow = await prisma.audit_logs.findFirst({
    where: { entity_id: entityCoop1, action: "kyc_change" },
  });
  assert(dbRow != null, `run ${run}: audit persisted in DB`);

  // eslint-disable-next-line no-console
  console.log(`Run ${run} OK — household coop1=${entityCoop1} coop2=${entityCoop2}`);
}

async function shutdown() {
  if (testServer) {
    await new Promise<void>((resolve, reject) => {
      testServer!.close((err) => (err ? reject(err) : resolve()));
    });
    testServer = null;
    baseUrl = "";
  }
  await prisma.$disconnect();
}

async function main() {
  try {
    for (let i = 1; i <= 3; i++) {
      await runOnce(i);
    }
    // eslint-disable-next-line no-console
    console.log("AUDIT-1: 3/3 passed");
  } finally {
    await shutdown();
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exitCode = 1;
});
