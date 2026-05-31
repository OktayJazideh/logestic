/**
 * COOP-1: cooperative KYC + admin workflow + coop scope tests.
 * Run 3x: npm run test:coop1
 * Requires: server on TEST_BASE_URL, db:migrate, db:seed.
 */
import "dotenv/config";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";

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

async function selectWorkspace(token: string, mineId: number, membershipKind: "OPERATIONAL" | "COMMUNITY" = "COMMUNITY") {
  const r = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: mineId, membership_kind: membershipKind }),
  });
  if (r.status !== 200 || !r.json.success) {
    throw new Error(`workspace select failed: ${JSON.stringify(r.json)}`);
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function runOnce(run: number) {
  await appContext.entities.hydrate();

  const adminToken = await loginAs("09000000000");
  const unique = `${Date.now()}${run}${Math.floor(Math.random() * 1e6)}`;
  const suffix = unique.slice(-6);
  const managerMobile = `0901999${run}${suffix.slice(-3)}`;
  const nationalId = `coop-test-${unique}`;

  const create = await http("/api/admin/cooperatives", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      mine_id: 1,
      name: `تعاونی تست ${run}`,
      national_id: nationalId,
      registration_number: `REG-${suffix}`,
      ceo_name: "مدیر تست",
      board_members: [{ name: "عضو یک", role: "رئیس" }],
      activity_scope: "حمل",
      geo_area: "منطقه ۱",
      iban: "IR820540102680020817909002",
    }),
  });
  assert(create.status === 201, `run ${run}: create cooperative failed: ${JSON.stringify(create.json)}`);
  const coop = create.json.data.cooperative;
  assert(coop.status === "PENDING_KYC", `run ${run}: expected PENDING_KYC, got ${coop.status}`);

  const invite = await http(`/api/admin/cooperatives/${coop.id}/invite-manager`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mobile_number: managerMobile, role: "COOP_ADMIN" }),
  });
  assert(invite.status === 200, `run ${run}: invite-manager failed: ${JSON.stringify(invite.json)}`);
  assert(invite.json.data.user.cooperative_id === coop.id, `run ${run}: invite cooperative_id mismatch`);

  const managerToken = await loginAs(managerMobile);

  const mePending = await http("/api/coop/me", {
    headers: { Authorization: `Bearer ${managerToken}` },
  });
  assert(mePending.status === 200, `run ${run}: coop/me pending failed`);
  assert(mePending.json.data.cooperative?.status === "PENDING_KYC", `run ${run}: me should show PENDING_KYC`);

  const membersBlocked = await http("/api/coop/members", {
    headers: { Authorization: `Bearer ${managerToken}` },
  });
  assert(membersBlocked.status === 403, `run ${run}: members should be blocked before verify`);

  const verify = await http(`/api/admin/cooperatives/${coop.id}/verify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(verify.status === 200, `run ${run}: verify failed: ${JSON.stringify(verify.json)}`);
  assert(verify.json.data.cooperative.status === "ACTIVE", `run ${run}: verify should set ACTIVE`);

  await selectWorkspace(managerToken, 1);

  const meActive = await http("/api/coop/me", {
    headers: { Authorization: `Bearer ${managerToken}` },
  });
  assert(meActive.json.data.cooperative?.status === "ACTIVE", `run ${run}: me should show ACTIVE after verify`);

  const membersOk = await http("/api/coop/members", {
    headers: { Authorization: `Bearer ${managerToken}` },
  });
  assert(membersOk.status === 200, `run ${run}: members after verify failed`);

  const suspend = await http(`/api/admin/cooperatives/${coop.id}/suspend`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ reason: "تست تعلیق" }),
  });
  assert(suspend.status === 200, `run ${run}: suspend failed`);
  assert(suspend.json.data.cooperative.status === "SUSPENDED", `run ${run}: suspend status`);

  const membersSuspended = await http("/api/coop/members", {
    headers: { Authorization: `Bearer ${managerToken}` },
  });
  assert(membersSuspended.status === 403, `run ${run}: members should be blocked when suspended`);

  const coopForbidden = await http("/api/admin/cooperatives", {
    method: "POST",
    headers: { Authorization: `Bearer ${managerToken}` },
    body: JSON.stringify({ mine_id: 1, name: "نباید ساخته شود" }),
  });
  assert(coopForbidden.status === 403, `run ${run}: COOP_ADMIN must not create cooperatives`);

  // eslint-disable-next-line no-console
  console.log(`Run ${run} OK — coop id=${coop.id} manager=${managerMobile}`);
}

async function main() {
  await initAppContext();
  if (!appContext.mineData.listMines().length) {
    throw new Error("No mines — run npm run db:seed");
  }

  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  // eslint-disable-next-line no-console
  console.log("COOP-1 KYC + scope: 3/3 passed");
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exitCode = 1;
});
