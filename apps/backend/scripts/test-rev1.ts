/**
 * REVERSE-1: reversal window (72h) + post-settled adjustment.
 * Run 3x: npm run test:rev1
 * Requires: DATABASE_URL, server on TEST_BASE_URL, db:migrate, db:seed.
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
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

async function verifyMission(
  adminToken: string,
  driverToken: string,
  coopOpToken: string,
  coopAdminToken: string,
  run: number,
) {
  const qty = 5 + run * 0.1;
  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: 1, quantity_tons: qty, material_type: "ORE" }),
  });
  if (seed.status !== 200 || !seed.json.success) {
    throw new Error(`run ${run}: seed failed ${JSON.stringify(seed.json)}`);
  }
  const missionId = seed.json.data.mission.id as number;

  const accept = await http(`/api/driver/missions/${missionId}/steps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ step: "ACCEPTED" }),
  });
  if (accept.status !== 200) throw new Error(`run ${run}: ACCEPTED failed`);

  const arrived = await http(`/api/driver/missions/${missionId}/steps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ step: "ARRIVED", latitude: 35.1, longitude: 51.1 }),
  });
  if (arrived.status !== 200) throw new Error(`run ${run}: ARRIVED failed`);

  const ticketRes = await http(`/api/driver/missions/${missionId}/ticket`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const ticketId = ticketRes.json?.data?.ticket?.id as number;
  if (!ticketId) throw new Error(`run ${run}: no ticket`);

  const weights = await http(`/api/weighbridge/tickets/${ticketId}/weights`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopOpToken}` },
    body: JSON.stringify({ empty_weight: 10000, loaded_weight: 10000 + qty * 1000 }),
  });
  if (weights.status !== 200) throw new Error(`run ${run}: weights failed`);

  for (const step of ["LOADED", "IN_TRANSIT", "DELIVERED"] as const) {
    const body = step === "DELIVERED" ? { step, latitude: 35.3, longitude: 51.3 } : { step };
    const r = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify(body),
    });
    if (r.status !== 200) throw new Error(`run ${run}: step ${step} failed`);
  }

  const approve = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${(await loginAs("09000000002"))}` },
  });
  if (approve.status !== 200) throw new Error(`run ${run}: approve failed ${JSON.stringify(approve.json)}`);

  const mission = await prisma.missions.findUnique({ where: { id: BigInt(missionId) } });
  if (mission?.status !== "VERIFIED" || !mission.verified_at) {
    throw new Error(`run ${run}: expected VERIFIED with verified_at`);
  }
  return missionId;
}

async function runOnce(run: number) {
  const adminToken = await loginAs("09000000000");
  const driverToken = await loginAs("09000000003");
  const coopOpToken = await loginAs("09000000111");
  const coopAdminToken = await loginAs("09000000001");
  const operationAdminToken = await loginAs("09000000002");

  const missionId = await verifyMission(adminToken, driverToken, coopOpToken, coopAdminToken, run);

  await selectMine(operationAdminToken, 1);

  const okReverse = await http(`/api/missions/${missionId}/payment/reversal`, {
    method: "POST",
    headers: { Authorization: `Bearer ${operationAdminToken}` },
    body: JSON.stringify({ reason: `test reversal run ${run}` }),
  });
  if (okReverse.status !== 200 || !okReverse.json.success) {
    throw new Error(`run ${run}: in-window reversal failed ${JSON.stringify(okReverse.json)}`);
  }
  const afterRev = await prisma.missions.findUnique({ where: { id: BigInt(missionId) } });
  if (afterRev?.payment_state !== "FAILED") {
    throw new Error(`run ${run}: expected payment_state FAILED after reversal`);
  }

  const missionId2 = await verifyMission(adminToken, driverToken, coopOpToken, coopAdminToken, run);
  const expiredAt = new Date(Date.now() - 73 * 60 * 60 * 1000);
  await prisma.missions.update({
    where: { id: BigInt(missionId2) },
    data: { verified_at: expiredAt },
  });

  const expiredReverse = await http(`/api/missions/${missionId2}/payment/reversal`, {
    method: "POST",
    headers: { Authorization: `Bearer ${operationAdminToken}` },
    body: JSON.stringify({ reason: `expired reversal run ${run}` }),
  });
  if (expiredReverse.status !== 409 || expiredReverse.json?.error?.code !== "reverse_window_expired") {
    throw new Error(
      `run ${run}: expected 409 reverse_window_expired, got ${expiredReverse.status} ${JSON.stringify(expiredReverse.json)}`,
    );
  }

  const missionId3 = await verifyMission(adminToken, driverToken, coopOpToken, coopAdminToken, run);
  await prisma.missions.update({
    where: { id: BigInt(missionId3) },
    data: { status: "SETTLED", payment_state: "SETTLED" },
  });

  const settledReverse = await http(`/api/missions/${missionId3}/payment/reversal`, {
    method: "POST",
    headers: { Authorization: `Bearer ${operationAdminToken}` },
    body: JSON.stringify({ reason: `settled reversal run ${run}` }),
  });
  if (settledReverse.status !== 409 || settledReverse.json?.error?.code !== "cannot_reverse_settled") {
    throw new Error(
      `run ${run}: expected 409 cannot_reverse_settled, got ${settledReverse.status} ${JSON.stringify(settledReverse.json)}`,
    );
  }

  const postAdj = await http(`/api/missions/${missionId3}/adjustment/post-settled`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      reason: `post-settled adjustment run ${run}`,
      bank_reference: `BANK-REF-${run}-${Date.now()}`,
    }),
  });
  if (postAdj.status !== 200 || !postAdj.json.success) {
    throw new Error(`run ${run}: post-settled adjustment failed ${JSON.stringify(postAdj.json)}`);
  }

  const audit = await prisma.audit_logs.findFirst({
    where: {
      entity_type: "mission_post_settled_adjustment",
      entity_id: String(missionId3),
      action: "POST_SETTLED_ADJUSTMENT",
    },
    orderBy: { created_at: "desc" },
  });
  if (!audit) throw new Error(`run ${run}: audit log for post-settled adjustment missing`);

  console.log(`run ${run}: OK (in-window reverse, 72h reject, settled reject, post-settled adj)`);
}

async function main() {
  await initAppContext();
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  console.log("test:rev1 — all 3 runs passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
