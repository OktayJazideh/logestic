/**

 * PERM-1 RBAC + cooperative data-isolation tests.

 * Run 3x: npm run test:rbac

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



async function runOnce(run: number) {

  await appContext.entities.hydrate();



  const adminToken = await loginAs("09000000000");

  const coopAToken = await loginAs("09000000101");

  const coopBToken = await loginAs("09000000102");

  const driverToken = await loginAs("09000000003");



  const perms = await http("/api/auth/myPermissions", {

    headers: { Authorization: `Bearer ${coopAToken}` },

  });

  if (!perms.json.data?.permissions?.includes("members:read")) {

    throw new Error(`run ${run}: COOP_ADMIN missing members:read`);

  }



  const membersA = await http("/api/coop/members", {

    headers: { Authorization: `Bearer ${coopAToken}` },

  });

  if (membersA.status !== 200) throw new Error(`run ${run}: coop A members failed`);

  const listA = membersA.json.data.members as Array<{ cooperative_id?: number; head_name: string }>;

  if (listA.some((m) => m.cooperative_id === 2)) {

    throw new Error(`run ${run}: COOP_A saw COOP_B member`);

  }

  if (!listA.some((m) => m.cooperative_id === 1)) {

    throw new Error(`run ${run}: COOP_A should see at least one coop-1 member`);

  }



  const membersB = await http("/api/coop/members", {

    headers: { Authorization: `Bearer ${coopBToken}` },

  });

  const listB = membersB.json.data.members as Array<{ cooperative_id?: number }>;

  if (listB.some((m) => m.cooperative_id === 1)) {

    throw new Error(`run ${run}: COOP_B saw COOP_A member`);

  }



  const driverForbidden = await http("/api/coop/members", {

    headers: { Authorization: `Bearer ${driverToken}` },

  });

  if (driverForbidden.status !== 403) {

    throw new Error(`run ${run}: DRIVER should get 403 on coop members, got ${driverForbidden.status}`);

  }



  const settlementForbidden = await http("/api/settlement/batches", {

    headers: { Authorization: `Bearer ${coopAToken}` },

  });

  if (settlementForbidden.status !== 403) {

    throw new Error(`run ${run}: COOP_ADMIN should not execute settlement, got ${settlementForbidden.status}`);

  }



  const usersList = await http("/api/admin/users", {

    headers: { Authorization: `Bearer ${adminToken}` },

  });

  if (usersList.status !== 200 || !usersList.json.data?.users?.length) {

    throw new Error(`run ${run}: admin users list failed`);

  }



  const coopForbiddenAdmin = await http("/api/admin/users", {

    headers: { Authorization: `Bearer ${coopAToken}` },

  });

  if (coopForbiddenAdmin.status !== 403) {

    throw new Error(`run ${run}: COOP_ADMIN must not access admin users`);

  }

  const coopCanRequest = await http("/api/user-provisioning/requests", {
    headers: { Authorization: `Bearer ${coopAToken}` },
  });
  if (coopCanRequest.status !== 200) {
    throw new Error(`run ${run}: COOP_ADMIN should list provisioning requests, got ${coopCanRequest.status}`);
  }

  const coopCannotManage = await http("/api/admin/user-provisioning/requests", {
    headers: { Authorization: `Bearer ${coopAToken}` },
  });
  if (coopCannotManage.status !== 403) {
    throw new Error(`run ${run}: COOP_ADMIN must not access admin provisioning inbox`);
  }



  // eslint-disable-next-line no-console

  console.log(`Run ${run} OK — isolation A=${listA.length} B=${listB.length}`);

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

  console.log("PERM-1 RBAC isolation: 3/3 passed");

}



main().catch((e) => {

  // eslint-disable-next-line no-console

  console.error(e);

  process.exitCode = 1;

});


