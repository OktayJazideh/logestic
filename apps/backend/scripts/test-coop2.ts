/**
 * COOP-2: household/driver/fleet/vehicle KYC workflow tests.
 * Run 3x: npm run test:coop2
 * Requires: server on TEST_BASE_URL, db:migrate, db:seed.
 */
import "dotenv/config";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { prisma } from "../src/db/prisma";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4000";

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
    throw new Error(`verify failed for ${mobile}: ${JSON.stringify(verify.json)}`);
  }
  return verify.json.data.access_token as string;
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function runOnce(run: number) {
  await appContext.entities.hydrate();

  const operatorToken = await loginAs("09000000111");
  const unique = `${Date.now()}${run}${Math.floor(Math.random() * 1e6)}`;
  const applicantMobile = `0903${String(run).padStart(2, "0")}${unique.slice(-7)}`;

  await appContext.userStore.upsertUserByMobile(applicantMobile, "HOUSEHOLD", { is_active: true });
  const applicantToken = await loginAs(applicantMobile);

  const request = await http("/api/coop/households/request", {
    method: "POST",
    headers: { Authorization: `Bearer ${applicantToken}` },
    body: JSON.stringify({
      cooperative_id: 1,
      village_id: 1,
      head_name: `متقاضی ${run}`,
      national_id: `kyc-${unique}`,
      bank_iban: "IR820540102680020817909002",
    }),
  });
  assert(request.status === 201, `run ${run}: household request failed: ${JSON.stringify(request.json)}`);
  const household = request.json.data.household;
  assert(household.status === "PENDING", `run ${run}: expected PENDING`);

  const inboxBefore = await http("/api/coop/kyc/inbox", {
    headers: { Authorization: `Bearer ${operatorToken}` },
  });
  assert(inboxBefore.status === 200, `run ${run}: inbox failed`);
  const pendingIds = (inboxBefore.json.data.items as Array<{ id: number; entity_type: string }>)
    .filter((i) => i.entity_type === "household")
    .map((h) => h.id);
  assert(pendingIds.includes(household.id), `run ${run}: household not in inbox`);

  const approve = await http(`/api/coop/households/${household.id}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${operatorToken}` },
    body: JSON.stringify({}),
  });
  assert(approve.status === 200, `run ${run}: approve failed: ${JSON.stringify(approve.json)}`);
  assert(approve.json.data.household.status === "APPROVED", `run ${run}: expected APPROVED`);

  const auditRows = await prisma.audit_logs.findMany({
    where: { entity_type: "household", entity_id: String(household.id), action: "kyc_change" },
    orderBy: { created_at: "desc" },
    take: 5,
  });
  assert(auditRows.length >= 2, `run ${run}: expected kyc_change audit rows`);

  const suspend = await http(`/api/coop/households/${household.id}/suspend`, {
    method: "POST",
    headers: { Authorization: `Bearer ${operatorToken}` },
    body: JSON.stringify({ reason: "تست تعلیق KYC" }),
  });
  assert(suspend.status === 200, `run ${run}: suspend failed`);
  assert(suspend.json.data.household.status === "SUSPENDED", `run ${run}: expected SUSPENDED`);

  const driverMobile = `0904${String(run).padStart(2, "0")}${unique.slice(-7)}`;
  await appContext.userStore.upsertUserByMobile(driverMobile, "DRIVER", { is_active: true });
  const driverToken = await loginAs(driverMobile);

  const driverReq = await http("/api/coop/drivers/request", {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({
      cooperative_id: 1,
      full_name: `راننده ${run}`,
      license_number: `LIC-${unique}`,
      license_file_url: "https://example.com/license.pdf",
      identity_file_url: "https://example.com/id.pdf",
    }),
  });
  assert(driverReq.status === 201, `run ${run}: driver request failed: ${JSON.stringify(driverReq.json)}`);
  const driver = driverReq.json.data.driver;
  assert(driver.status === "PENDING", `run ${run}: driver PENDING`);

  const reject = await http(`/api/coop/drivers/${driver.id}/reject`, {
    method: "POST",
    headers: { Authorization: `Bearer ${operatorToken}` },
    body: JSON.stringify({ reason: "مدرک ناقص" }),
  });
  assert(reject.status === 200, `run ${run}: driver reject failed`);
  assert(reject.json.data.driver.status === "REJECTED", `run ${run}: driver REJECTED`);

  // eslint-disable-next-line no-console
  console.log(`Run ${run} OK — household=${household.id} driver=${driver.id}`);
}

async function main() {
  await initAppContext();

  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  // eslint-disable-next-line no-console
  console.log("COOP-2 KYC workflow: 3/3 passed");
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exitCode = 1;
});
