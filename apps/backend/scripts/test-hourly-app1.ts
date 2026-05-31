/**
 * HOURLY-APP-1: operator context + start/end + consultant ENDED inbox.
 * Run 3x: npm run test:hourly-app1
 */
import "dotenv/config";
import {
  ensureTestHttpServer,
  getTestBaseUrl,
  runIntegrationScript,
} from "./lib/testHttpServer";

let BASE = getTestBaseUrl();

async function http(path: string, init?: RequestInit) {
  BASE = await ensureTestHttpServer();
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

async function selectWorkspace(token: string, mineId: number) {
  const r = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: mineId, membership_kind: "OPERATIONAL" }),
  });
  if (r.status !== 200 || !r.json.success) {
    throw new Error(`workspace select failed: ${JSON.stringify(r.json)}`);
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function runOnce(run: number) {
  const adminToken = await loginAs("09000000000");
  const operatorToken = await loginAs("09000000008");
  const consultantToken = await loginAs("09000000006");

  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: 1, quantity_tons: 5 + run * 0.1, material_type: "ORE" }),
  });
  assert(seed.status === 200 && seed.json.success, `devSeed failed run ${run}: ${JSON.stringify(seed.json)}`);

  const missionId = seed.json.data.mission.id as number;
  const vehicleId = seed.json.data.mission.vehicle_id as number;
  const householdId = seed.json.data.entities.household.id as number;

  await selectWorkspace(operatorToken, 1);

  const ctxBefore = await http("/api/operator/hourly/context", {
    headers: { Authorization: `Bearer ${operatorToken}` },
  });
  assert(ctxBefore.status === 200 && ctxBefore.json.success, `context failed run ${run}: ${JSON.stringify(ctxBefore.json)}`);
  assert(ctxBefore.json.data.active_log == null, `run ${run}: expected no active log before start`);
  const assignments = ctxBefore.json.data.assignments as { mission_id: number }[];
  assert(
    assignments.some((a) => a.mission_id === missionId),
    `run ${run}: seeded mission ${missionId} missing from assignments`,
  );

  const startRes = await http("/api/hourly/start", {
    method: "POST",
    headers: { Authorization: `Bearer ${operatorToken}` },
    body: JSON.stringify({
      mission_id: missionId,
      vehicle_id: vehicleId,
      household_id: householdId,
      start_photo_url: "https://example.com/start.jpg",
      start_geo: { lat: 27.1, lng: 55.2 },
      note: `hourly-app-run-${run}`,
    }),
  });
  assert(startRes.status === 201 && startRes.json.success, `start failed run ${run}: ${JSON.stringify(startRes.json)}`);
  const logId = startRes.json.data.log.id as number;
  assert(startRes.json.data.log.status === "STARTED", `run ${run}: expected STARTED`);

  const ctxActive = await http("/api/operator/hourly/context", {
    headers: { Authorization: `Bearer ${operatorToken}` },
  });
  assert(ctxActive.json.data.active_log?.id === logId, `run ${run}: active_log id mismatch`);

  await new Promise((r) => setTimeout(r, 1200));

  const endRes = await http(`/api/hourly/${logId}/end`, {
    method: "POST",
    headers: { Authorization: `Bearer ${operatorToken}` },
    body: JSON.stringify({
      end_photo_url: "https://example.com/end.jpg",
      end_geo: { lat: 27.11, lng: 55.21 },
    }),
  });
  assert(endRes.status === 200 && endRes.json.success, `end failed run ${run}: ${JSON.stringify(endRes.json)}`);
  assert(endRes.json.data.log.status === "ENDED", `run ${run}: expected ENDED`);

  await selectWorkspace(consultantToken, 1);

  const inbox = await http("/api/hourly?status=ENDED", {
    headers: { Authorization: `Bearer ${consultantToken}` },
  });
  assert(inbox.status === 200 && inbox.json.success, `inbox failed run ${run}: ${JSON.stringify(inbox.json)}`);
  const logs = inbox.json.data.logs as { id: number; status: string }[];
  assert(
    logs.some((l) => l.id === logId && l.status === "ENDED"),
    `run ${run}: log ${logId} not in consultant ENDED inbox`,
  );

  console.log(`run ${run} OK: log=${logId} ENDED in consultant inbox`);
}

async function main() {
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  console.log("HOURLY-APP-1: 3/3 passed");
}

runIntegrationScript(main);
