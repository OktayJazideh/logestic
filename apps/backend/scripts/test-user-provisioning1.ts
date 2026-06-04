/**
 * USER-PROV-1: user provisioning + admin CRUD smoke tests.
 * Requires: server on TEST_BASE_URL, db:migrate (0046), db:seed (minimal admin 09000000000).
 */
import "dotenv/config";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { hasPermission } from "../src/types/permissions";
import { nationalIdFromSeed } from "../src/lib/nationalId";

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
  const token = verify.json?.data?.token;
  if (!token) throw new Error(`login failed for ${mobile}`);
  return token as string;
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  await initAppContext();
  assert(hasPermission("COOP_ADMIN", "users:request"), "COOP_ADMIN users:request");
  assert(hasPermission("OPERATION_ADMIN", "users:request"), "OPERATION_ADMIN users:request");
  assert(!hasPermission("COOP_ADMIN", "users:manage"), "COOP_ADMIN no users:manage");

  const adminToken = await loginAs("09000000000");

  async function ensureRoleUser(mobile: string, role: string, cooperative_id?: number) {
    const res = await http("/api/admin/users", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        mobile_number: mobile,
        role,
        ...(cooperative_id != null ? { cooperative_id } : {}),
        is_active: true,
      }),
    });
    assert(res.status === 201 || res.status === 409, `ensure ${role} ${mobile}: ${res.status}`);
  }

  await ensureRoleUser("09000000001", "COOP_ADMIN", 1);
  await ensureRoleUser("09000000002", "OPERATION_ADMIN");

  const coopToken = await loginAs("09000000001");
  const opToken = await loginAs("09000000002");

  const mobileNew = "09000000999";
  const nationalNew = nationalIdFromSeed("999000001");

  const createRes = await http("/api/admin/users", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      mobile_number: mobileNew,
      national_id: nationalNew,
      role: "OPERATOR",
      full_name: "اپراتور تست",
      is_active: true,
    }),
  });
  assert(createRes.status === 201, `admin create user: ${createRes.status} ${JSON.stringify(createRes.json)}`);

  const mobileNoNat = "09000000997";
  const noNatRes = await http("/api/admin/users", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      mobile_number: mobileNoNat,
      role: "CONSULTANT",
      is_active: true,
    }),
  });
  assert(noNatRes.status === 201, `admin create without national_id: ${noNatRes.status}`);
  const noNatUserId = noNatRes.json?.data?.user?.id;
  await http(`/api/admin/users/${noNatUserId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  const dupMobile = await http("/api/admin/users", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      mobile_number: mobileNew,
      national_id: nationalIdFromSeed("999000002"),
      role: "OPERATOR",
    }),
  });
  assert(dupMobile.status === 409, `duplicate mobile expected 409, got ${dupMobile.status}`);

  const coopForbidden = await http("/api/admin/users", {
    headers: { Authorization: `Bearer ${coopToken}` },
  });
  assert(coopForbidden.status === 403, "COOP cannot list admin users");

  const reqBody = {
    target_role: "COOP_OPERATOR",
    mobile_number: "09000000998",
    national_id: nationalIdFromSeed("998000001"),
    full_name: "اپراتور تعاونی",
    note: "test request",
  };
  const coopReq = await http("/api/user-provisioning/requests", {
    method: "POST",
    headers: { Authorization: `Bearer ${coopToken}` },
    body: JSON.stringify(reqBody),
  });
  assert(coopReq.status === 200, `coop request: ${coopReq.status} ${JSON.stringify(coopReq.json)}`);
  const requestId = coopReq.json?.data?.request?.id;
  assert(requestId, "request id missing");

  const inbox = await http("/api/admin/user-provisioning/requests?status=PENDING", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(inbox.status === 200, "admin inbox");
  const found = (inbox.json?.data?.requests ?? []).some((r: { id: number }) => r.id === requestId);
  assert(found, "pending request in admin inbox");

  const approve = await http(`/api/admin/user-provisioning/requests/${requestId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({}),
  });
  assert(approve.status === 200, `approve: ${approve.status} ${JSON.stringify(approve.json)}`);

  const otpAfter = await http("/api/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ mobile_number: reqBody.mobile_number }),
  });
  assert(otpAfter.status === 200, `approved user can request OTP: ${otpAfter.status}`);

  const userId = createRes.json?.data?.user?.id;
  const del = await http(`/api/admin/users/${userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(del.status === 200, `soft delete: ${del.status}`);

  const otpInactive = await http("/api/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ mobile_number: mobileNew }),
  });
  assert(otpInactive.status === 403, `deleted user OTP blocked: ${otpInactive.status}`);

  // eslint-disable-next-line no-console
  console.log("USER-PROV-1 OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
