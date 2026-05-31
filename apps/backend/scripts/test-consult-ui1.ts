/**
 * CONSULT-UI-1: consultant hourly inbox — GET /hourly?status=ENDED, verify + reject.
 * Run 3x: npm run test:consult-ui1
 */
import "dotenv/config";
import {
  ensureTestHttpServer,
  getTestBaseUrl,
  prisma,
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

async function selectMine(token: string, mineId: number) {
  const r = await http("/api/mine/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: mineId }),
  });
  if (r.status !== 200 || !r.json.success) {
    throw new Error(`mine select failed: ${JSON.stringify(r.json)}`);
  }
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

async function seedEndedLog(run: number, adminToken: string, operatorToken: string) {
  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: 1, quantity_tons: 4 + run * 0.1, material_type: "ORE" }),
  });
  assert(seed.status === 200 && seed.json.success, `devSeed failed run ${run}: ${JSON.stringify(seed.json)}`);

  const missionId = seed.json.data.mission.id as number;
  const vehicleId = seed.json.data.mission.vehicle_id as number;
  const householdId = seed.json.data.entities.household.id as number;

  await selectWorkspace(operatorToken, 1);

  const startRes = await http("/api/hourly/start", {
    method: "POST",
    headers: { Authorization: `Bearer ${operatorToken}` },
    body: JSON.stringify({
      mission_id: missionId,
      vehicle_id: vehicleId,
      household_id: householdId,
      start_photo_url: "https://example.com/start.jpg",
      start_geo: { lat: 27.1, lng: 55.2 },
      note: `consult-ui-run-${run}`,
    }),
  });
  assert(startRes.status === 201 && startRes.json.success, `start failed run ${run}: ${JSON.stringify(startRes.json)}`);
  const logId = startRes.json.data.log.id as number;

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

  return { logId, missionId, rawHours: endRes.json.data.log.raw_hours as number };
}

async function runOnce(run: number) {
  const adminToken = await loginAs("09000000000");
  const operatorToken = await loginAs("09000000008");
  const consultantToken = await loginAs("09000000006");

  const { logId: verifyLogId, rawHours } = await seedEndedLog(run, adminToken, operatorToken);
  const { logId: rejectLogId } = await seedEndedLog(run + 50, adminToken, operatorToken);

  await selectMine(consultantToken, 1);

  const listRes = await http("/api/hourly?status=ENDED", {
    headers: { Authorization: `Bearer ${consultantToken}` },
  });
  assert(listRes.status === 200 && listRes.json.success, `list failed run ${run}: ${JSON.stringify(listRes.json)}`);
  const logs = listRes.json.data.logs as Array<{
    id: number;
    status: string;
    operator_label?: string;
    equipment_label?: string;
    duration_hours?: number;
  }>;
  assert(logs.every((l) => l.status === "ENDED"), `run ${run}: all logs must be ENDED`);
  const verifyRow = logs.find((l) => l.id === verifyLogId);
  assert(verifyRow != null, `run ${run}: verify log missing from ENDED list`);
  assert(verifyRow.operator_label != null, `run ${run}: operator_label missing`);
  assert(verifyRow.equipment_label != null, `run ${run}: equipment_label missing`);

  const verifyRes = await http(`/api/hourly/${verifyLogId}/verify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${consultantToken}` },
    body: JSON.stringify({
      billable_hours: Math.min(rawHours, rawHours * 0.95 + 0.0001),
      reason: `consult-ui verify run ${run}`,
    }),
  });
  assert(verifyRes.status === 200 && verifyRes.json.success, `verify failed run ${run}: ${JSON.stringify(verifyRes.json)}`);
  assert(verifyRes.json.data.log.status === "APPROVED", `run ${run}: expected APPROVED`);

  const rejectRes = await http(`/api/hourly/${rejectLogId}/reject`, {
    method: "POST",
    headers: { Authorization: `Bearer ${consultantToken}` },
    body: JSON.stringify({ rejection_reason: `consult-ui reject run ${run} — دلیل کافی` }),
  });
  assert(rejectRes.status === 200 && rejectRes.json.success, `reject failed run ${run}: ${JSON.stringify(rejectRes.json)}`);
  assert(rejectRes.json.data.log.status === "REJECTED", `run ${run}: expected REJECTED`);

  const listAfter = await http("/api/hourly?status=ENDED", {
    headers: { Authorization: `Bearer ${consultantToken}` },
  });
  assert(listAfter.status === 200 && listAfter.json.success, `list after run ${run}`);
  const idsAfter = (listAfter.json.data.logs as Array<{ id: number }>).map((l) => l.id);
  assert(!idsAfter.includes(verifyLogId), `run ${run}: verified log should leave ENDED list`);
  assert(!idsAfter.includes(rejectLogId), `run ${run}: rejected log should leave ENDED list`);

  await selectMine(adminToken, 1);
  const adminList = await http("/api/hourly?status=ENDED", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(adminList.status === 200 && adminList.json.success, `run ${run}: ADMIN debug list must work`);

  const permsRes = await http("/api/auth/myPermissions", {
    headers: { Authorization: `Bearer ${consultantToken}` },
  });
  assert(permsRes.status === 200 && permsRes.json.success, `permissions run ${run}`);
  const perms = permsRes.json.data.permissions as string[];
  assert(perms.includes("hourly:verify"), `run ${run}: consultant must have hourly:verify`);
  assert(!perms.includes("settlement:read"), `run ${run}: consultant must not have settlement:read`);
  assert(!perms.includes("hold:create"), `run ${run}: consultant must not have hold:create`);

  console.log(`run ${run} OK: verify=${verifyLogId} reject=${rejectLogId} ENDED list enriched`);
}

runIntegrationScript(async () => {
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  console.log("CONSULT-UI-1: 3/3 passed");
});
