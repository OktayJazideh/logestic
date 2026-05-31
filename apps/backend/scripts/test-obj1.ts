/**
 * OBJ-1 / OBJ-REP-1: membership objections API + reporter from auth (no anonymous).
 * Run 3x: npm run test:obj1
 * Requires: DATABASE_URL, db:migrate, db:seed (in-process server).
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { prisma } from "../src/db/prisma";

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

async function meUserId(token: string): Promise<number> {
  const me = await http("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
  if (me.status !== 200 || !me.json.success) {
    throw new Error(`auth/me failed: ${JSON.stringify(me.json)}`);
  }
  const id = me.json.data?.id;
  if (typeof id !== "number") throw new Error("auth/me missing id");
  return id;
}

type ObjectionDto = {
  id: number;
  household_id: number;
  reporter_user_id: number;
  reporter_mobile?: string;
  status: string;
};

async function runOnce(run: number) {
  await appContext.entities.hydrate();
  const households = appContext.entities.listHouseholdsByCooperative(1);
  assert(households.length > 0, `run ${run}: need household in coop 1 — run db:seed`);
  const target = households[0]!;

  const coopToken = await loginAs("09000000001");
  const coopBToken = await loginAs("09000000102");
  const householdToken = await loginAs("09000001001");
  const driverToken = await loginAs("09000000003");
  const coopAdminUserId = await meUserId(coopToken);
  const householdUserId = await meUserId(householdToken);

  const orphanMobile = `09000009${String(run).padStart(3, "0")}`;
  await appContext.userStore.upsertUserByMobile(orphanMobile, "COOP_ADMIN", {
    is_active: true,
    cooperative_id: null,
  });
  const orphanToken = await loginAs(orphanMobile);

  const createCoop = await http("/api/coop/objections", {
    method: "POST",
    headers: { Authorization: `Bearer ${coopToken}` },
    body: JSON.stringify({
      household_id: target.id,
      reason: `اعتراض تست ${run} از ادمین تعاونی`,
    }),
  });
  assert(createCoop.status === 200 && createCoop.json.success, `run ${run}: coop create failed`);
  const obj1 = createCoop.json.data.objection as ObjectionDto;
  assert(typeof obj1.id === "number", `run ${run}: tracking id missing`);
  assert(obj1.reporter_user_id === coopAdminUserId, `run ${run}: reporter_user_id from session (coop admin)`);
  assert(obj1.reporter_mobile === "09000000001", `run ${run}: reporter from auth coop admin`);
  assert(obj1.status === "PENDING", `run ${run}: new objection PENDING`);

  const createHousehold = await http("/api/coop/objections", {
    method: "POST",
    headers: { Authorization: `Bearer ${householdToken}` },
    body: JSON.stringify({
      household_id: target.id,
      reason: `اعتراض کامل ${run}`,
    }),
  });
  assert(createHousehold.status === 200, `run ${run}: household create failed`);
  const obj2 = createHousehold.json.data.objection as ObjectionDto;
  assert(obj2.reporter_user_id === householdUserId, `run ${run}: household reporter_user_id from session`);
  assert(obj2.reporter_mobile === "09000001001", `run ${run}: household reporter mobile`);

  const spoofReporter = await http("/api/coop/objections", {
    method: "POST",
    headers: { Authorization: `Bearer ${coopToken}` },
    body: JSON.stringify({
      household_id: target.id,
      reason: "تلاش جعل reporter",
      reporter_user_id: 1,
      reporter_mobile: "09000000000",
    }),
  });
  assert(spoofReporter.status === 400, `run ${run}: client reporter fields must be rejected`);

  const noCoopScope = await http("/api/coop/objections", {
    method: "POST",
    headers: { Authorization: `Bearer ${orphanToken}` },
    body: JSON.stringify({ household_id: target.id, reason: "بدون scope تعاونی" }),
  });
  assert(noCoopScope.status === 403, `run ${run}: COOP_ADMIN without cooperative scope should 403`);

  const householdsB = appContext.entities.listHouseholdsByCooperative(2);
  if (householdsB.length > 0) {
    const crossCoop = await http("/api/coop/objections", {
      method: "POST",
      headers: { Authorization: `Bearer ${coopBToken}` },
      body: JSON.stringify({
        household_id: target.id,
        reason: "خانوار خارج از scope",
      }),
    });
    assert(crossCoop.status === 403, `run ${run}: household outside cooperative scope should 403`);
  }

  const invalidReason = await http("/api/coop/objections", {
    method: "POST",
    headers: { Authorization: `Bearer ${coopToken}` },
    body: JSON.stringify({ household_id: target.id, reason: "xx" }),
  });
  assert(invalidReason.status === 400, `run ${run}: short reason should 400`);

  const anonymous = await http("/api/coop/objections", {
    method: "POST",
    body: JSON.stringify({ household_id: target.id, reason: "بدون توکن" }),
  });
  assert(anonymous.status === 401, `run ${run}: anonymous submit should 401`);

  const list = await http("/api/coop/objections", {
    headers: { Authorization: `Bearer ${coopToken}` },
  });
  assert(list.status === 200, `run ${run}: list objections failed`);
  const items = list.json.data.objections as ObjectionDto[];
  assert(items.some((o) => o.id === obj2.id), `run ${run}: created objection not in list`);
  const listed = items.find((o) => o.id === obj2.id);
  assert(listed?.reporter_user_id === householdUserId, `run ${run}: list exposes reporter_user_id for audit`);
  assert(listed?.reporter_mobile === "09000001001", `run ${run}: list exposes reporter_mobile for audit`);

  const resolveOk = await http(`/api/coop/objections/${obj1.id}/resolve`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${coopToken}` },
    body: JSON.stringify({ resolution_reason: `تأیید اعتراض ${run}` }),
  });
  assert(resolveOk.status === 200, `run ${run}: resolve failed: ${JSON.stringify(resolveOk.json)}`);
  assert(resolveOk.json.data.objection.status === "RESOLVED", `run ${run}: status not RESOLVED`);

  const resolveNoReason = await http(`/api/coop/objections/${obj2.id}/resolve`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${coopToken}` },
    body: JSON.stringify({}),
  });
  assert(resolveNoReason.status === 400, `run ${run}: resolve without reason should 400`);

  const rejectOk = await http(`/api/coop/objections/${obj2.id}/resolve`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${coopToken}` },
    body: JSON.stringify({ resolution_reason: `رد اعتراض ${run}` }),
  });
  assert(rejectOk.status === 200, `run ${run}: reject failed`);

  const auditSubmitted = await prisma.audit_logs.findFirst({
    where: { entity_type: "membership_objection", entity_id: String(obj1.id), action: "objection_submitted" },
  });
  assert(auditSubmitted != null, `run ${run}: objection_submitted audit missing`);

  const auditResolved = await prisma.audit_logs.findFirst({
    where: { entity_type: "membership_objection", entity_id: String(obj1.id), action: "objection_resolved" },
  });
  assert(auditResolved != null, `run ${run}: objection_resolved audit missing`);
  assert(auditResolved.reason === `تأیید اعتراض ${run}`, `run ${run}: resolve audit reason`);

  const auditResolved2 = await prisma.audit_logs.findFirst({
    where: { entity_type: "membership_objection", entity_id: String(obj2.id), action: "objection_resolved" },
  });
  assert(auditResolved2 != null, `run ${run}: second objection_resolved audit missing`);

  const driverForbidden = await http("/api/coop/objections", {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ household_id: target.id, reason: "نباید ثبت شود" }),
  });
  assert(driverForbidden.status === 403, `run ${run}: driver should be forbidden`);

  // eslint-disable-next-line no-console
  console.log(`Run ${run} OK — objection ids ${obj1.id}, ${obj2.id}`);
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
    console.log("OBJ-1 / OBJ-REP-1: 3/3 passed");
  } finally {
    await shutdown();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  });
