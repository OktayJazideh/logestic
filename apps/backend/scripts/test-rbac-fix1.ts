/**
 * RBAC-FIX-1: payment hold/release — OPERATION_ADMIN yes, CONSULTANT no.
 * Run: npm run test:rbac-fix1
 * Requires: server on TEST_BASE_URL, db:migrate, db:seed.
 */
import "dotenv/config";
import { initAppContext } from "../src/lib/appInit";

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

async function selectMine(token: string, mineId: number) {
  const r = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: mineId }),
  });
  if (r.status !== 200 || !r.json.success) {
    throw new Error(`workspace select failed: ${JSON.stringify(r.json)}`);
  }
}

async function runOnce(run: number) {
  const adminToken = await loginAs("09000000000");
  const consultantToken = await loginAs("09000000006");
  const operationAdminToken = await loginAs("09000000002");

  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: 1, quantity_tons: 4.2 + run * 0.1, material_type: "ORE" }),
  });
  if (seed.status !== 200 || !seed.json.success) {
    throw new Error(`run ${run}: seed failed ${JSON.stringify(seed.json)}`);
  }
  const missionId = seed.json.data.mission.id as number;

  await selectMine(consultantToken, 1);
  await selectMine(operationAdminToken, 1);

  const consultantHold = await http(`/api/missions/${missionId}/payment/hold`, {
    method: "POST",
    headers: { Authorization: `Bearer ${consultantToken}` },
    body: JSON.stringify({ reason: `consultant hold run ${run}` }),
  });
  if (consultantHold.status !== 403) {
    throw new Error(
      `run ${run}: CONSULTANT hold expected 403, got ${consultantHold.status} ${JSON.stringify(consultantHold.json)}`,
    );
  }

  const opHold = await http(`/api/missions/${missionId}/payment/hold`, {
    method: "POST",
    headers: { Authorization: `Bearer ${operationAdminToken}` },
    body: JSON.stringify({ reason: `operation admin hold run ${run}` }),
  });
  if (opHold.status !== 200 || !opHold.json.success) {
    throw new Error(
      `run ${run}: OPERATION_ADMIN hold expected 200, got ${opHold.status} ${JSON.stringify(opHold.json)}`,
    );
  }

  console.log(`run ${run}: OK (CONSULTANT 403, OPERATION_ADMIN 200)`);
}

async function main() {
  await initAppContext();
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  console.log("RBAC-FIX-1: 3/3 passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
