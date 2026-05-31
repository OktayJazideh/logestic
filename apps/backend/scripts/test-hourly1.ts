/**
 * HOURLY-1: OPERATOR START/END + CONSULTANT verify + 85/13/2 split.
 * Run 3x: npm run test:hourly1
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
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

async function runOnce(run: number) {
  const adminToken = await loginAs("09000000000");
  const operatorToken = await loginAs("09000000008");
  const consultantToken = await loginAs("09000000006");

  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: 1, quantity_tons: 5 + run * 0.1, material_type: "ORE" }),
  });
  if (seed.status !== 200 || !seed.json.success) {
    throw new Error(`devSeed failed run ${run}: ${JSON.stringify(seed.json)}`);
  }

  const missionId = seed.json.data.mission.id as number;
  const vehicleId = seed.json.data.mission.vehicle_id as number;
  const householdId = seed.json.data.entities.household.id as number;

  await selectWorkspace(operatorToken, 1);
  await selectWorkspace(consultantToken, 1);

  const startRes = await http("/api/hourly/start", {
    method: "POST",
    headers: { Authorization: `Bearer ${operatorToken}` },
    body: JSON.stringify({
      mission_id: missionId,
      vehicle_id: vehicleId,
      household_id: householdId,
      start_photo_url: "https://example.com/start.jpg",
      start_geo: { lat: 27.1, lng: 55.2 },
      note: `run-${run} start`,
    }),
  });
  if (startRes.status !== 201 || !startRes.json.success) {
    throw new Error(`hourly start failed run ${run}: ${JSON.stringify(startRes.json)}`);
  }
  const logId = startRes.json.data.log.id as number;
  if (startRes.json.data.log.raw_hours != null) {
    throw new Error(`run ${run}: raw_hours must be null at start`);
  }

  await new Promise((r) => setTimeout(r, 1500));

  const endRes = await http(`/api/hourly/${logId}/end`, {
    method: "POST",
    headers: { Authorization: `Bearer ${operatorToken}` },
    body: JSON.stringify({
      end_photo_url: "https://example.com/end.jpg",
      end_geo: { lat: 27.11, lng: 55.21 },
    }),
  });
  if (endRes.status !== 200 || !endRes.json.success) {
    throw new Error(`hourly end failed run ${run}: ${JSON.stringify(endRes.json)}`);
  }
  const rawHours = endRes.json.data.log.raw_hours as number;
  if (!(rawHours > 0)) throw new Error(`run ${run}: expected positive raw_hours, got ${rawHours}`);

  const verifyRes = await http(`/api/hourly/${logId}/verify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${consultantToken}` },
    body: JSON.stringify({
      billable_hours: Math.min(rawHours, rawHours * 0.9 + 0.0001),
      reason: `verified run ${run}`,
    }),
  });
  if (verifyRes.status !== 200 || !verifyRes.json.success) {
    throw new Error(`hourly verify failed run ${run}: ${JSON.stringify(verifyRes.json)}`);
  }

  const finance = verifyRes.json.data.finance;
  const total = finance.totalFare as number;
  const sum = (finance.ownerAmount as number) + (finance.platformAmount as number);
  if (Math.abs(sum - total) > 0.02) {
    throw new Error(`run ${run}: split sum ${sum} != total ${total}`);
  }

  const row = await prisma.hourly_work_logs.findUnique({ where: { id: BigInt(logId) } });
  if (!row || row.status !== "APPROVED" || row.hourly_rate_snapshot == null) {
    throw new Error(`run ${run}: DB log not approved or missing rate snapshot`);
  }

  const driverToken = await loginAs("09000000003");
  await selectWorkspace(driverToken, 1);
  const driverForbidden = await http("/api/hourly/start", {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({
      mission_id: missionId,
      vehicle_id: vehicleId,
      household_id: householdId,
      start_photo_url: "https://example.com/x.jpg",
      start_geo: { lat: 1, lng: 2 },
    }),
  });
  if (driverForbidden.status !== 403) {
    throw new Error(`run ${run}: DRIVER must not start hourly (got ${driverForbidden.status})`);
  }

  const overBill = await http(`/api/hourly/${logId}/verify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${consultantToken}` },
    body: JSON.stringify({ billable_hours: rawHours + 10, reason: "too high" }),
  });
  if (overBill.status !== 409) {
    throw new Error(`run ${run}: expected 409 for billable > raw, got ${overBill.status}`);
  }

  console.log(`run ${run} OK: log=${logId} raw=${rawHours.toFixed(4)} totalFare=${total}`);
}

async function main() {
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  console.log("HOURLY-1: 3/3 passed");
}

runIntegrationScript(main);
