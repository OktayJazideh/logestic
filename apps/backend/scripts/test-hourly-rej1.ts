/**
 * HOURLY-REJ-1: CONSULTANT reject ENDED hourly log — no finance ledger.
 * Run 3x: npm run test:hourly-rej1
 */
import "dotenv/config";
import * as auditRepo from "../src/repositories/auditLogsRepository";
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
    body: JSON.stringify({ mine_id: 1, quantity_tons: 3 + run * 0.1, material_type: "ORE" }),
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
      note: `rej-run-${run}`,
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

  return { logId, missionId };
}

async function runOnce(run: number) {
  const adminToken = await loginAs("09000000000");
  const operatorToken = await loginAs("09000000008");
  const consultantToken = await loginAs("09000000006");
  const employerToken = await loginAs("09000000007");

  const { logId, missionId } = await seedEndedLog(run, adminToken, operatorToken);

  const txBefore = await prisma.transactions.count({ where: { mission_id: BigInt(missionId) } });

  await selectMine(consultantToken, 1);

  const rejectRes = await http(`/api/hourly/${logId}/reject`, {
    method: "POST",
    headers: { Authorization: `Bearer ${consultantToken}` },
    body: JSON.stringify({ rejection_reason: `رد کارکرد run ${run} — دلیل کافی` }),
  });
  assert(rejectRes.status === 200 && rejectRes.json.success, `reject failed run ${run}: ${JSON.stringify(rejectRes.json)}`);
  assert(rejectRes.json.data.log.status === "REJECTED", `expected REJECTED run ${run}`);

  const row = await prisma.hourly_work_logs.findUnique({ where: { id: BigInt(logId) } });
  assert(row?.status === "REJECTED", `DB status REJECTED run ${run}`);
  assert(row?.rejection_reason != null && row.rejection_reason.length >= 10, `rejection_reason run ${run}`);
  assert(row?.rejected_at != null, `rejected_at run ${run}`);
  assert(row?.rejected_by_user_id != null, `rejected_by_user_id run ${run}`);

  const txAfter = await prisma.transactions.count({ where: { mission_id: BigInt(missionId) } });
  assert(txBefore === txAfter, `run ${run}: reject must not create transactions (${txBefore} -> ${txAfter})`);

  const audits = await auditRepo.listAuditLogsByEntity("hourly_work_log", String(logId));
  const rejectedAudit = audits.find((a) => a.action === "hourly_rejected");
  assert(rejectedAudit != null, `hourly_rejected audit missing run ${run}`);
  const after = rejectedAudit.after_value as { reason?: string; hours?: number; operator_id?: number } | undefined;
  assert(after?.reason != null && after.reason.length >= 10, `audit reason run ${run}`);

  const { logId: logId2 } = await seedEndedLog(run + 100, adminToken, operatorToken);
  await selectMine(consultantToken, 1);

  const emptyReason = await http(`/api/hourly/${logId2}/reject`, {
    method: "POST",
    headers: { Authorization: `Bearer ${consultantToken}` },
    body: JSON.stringify({ rejection_reason: "کوتاه" }),
  });
  assert(emptyReason.status === 400, `run ${run}: short reason must be 400, got ${emptyReason.status}`);

  const { logId: logId3 } = await seedEndedLog(run + 200, adminToken, operatorToken);
  await selectMine(employerToken, 1);

  const employerForbidden = await http(`/api/hourly/${logId3}/reject`, {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({ rejection_reason: "کارفرما نباید رد کند — تست" }),
  });
  assert(employerForbidden.status === 403, `run ${run}: EMPLOYER must get 403, got ${employerForbidden.status}`);

  console.log(`run ${run} OK: log=${logId} rejected, no txs, audit ok`);
}

runIntegrationScript(async () => {
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  console.log("HOURLY-REJ-1: 3/3 passed");
});
