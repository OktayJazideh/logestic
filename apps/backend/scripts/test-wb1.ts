/**
 * WB-1: weighbridge operator RBAC + 5% anomaly → PENDING_HOLD.
 * Run 3x: npm run test:wb1
 * Requires: server on TEST_BASE_URL, db:migrate, db:seed.
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { initAppContext } from "../src/lib/appInit";
import { isWeighbridgeAnomaly } from "../src/lib/weighbridgeAnomaly";

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

async function seedMission(adminToken: string, quantity_tons: number) {
  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: 1, quantity_tons, material_type: "ORE" }),
  });
  if (seed.status !== 200 || !seed.json.success) {
    throw new Error(`devSeed failed: ${JSON.stringify(seed.json)}`);
  }
  return seed.json.data.mission.id as number;
}

async function driverToTicket(driverToken: string, missionId: number) {
  const acceptRes = await http(`/api/driver/missions/${missionId}/steps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ step: "ACCEPTED" }),
  });
  if (acceptRes.status !== 200) throw new Error(`ACCEPTED failed: ${JSON.stringify(acceptRes.json)}`);

  const arrivedRes = await http(`/api/driver/missions/${missionId}/steps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ step: "ARRIVED", latitude: 35.1, longitude: 51.1 }),
  });
  if (arrivedRes.status !== 200) throw new Error(`ARRIVED failed: ${JSON.stringify(arrivedRes.json)}`);

  const ticketRes = await http(`/api/driver/missions/${missionId}/ticket`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const ticketId = ticketRes.json?.data?.ticket?.id as number;
  if (!ticketId) throw new Error("no ticket after ARRIVED");
  return ticketId;
}

async function runOnce(run: number) {
  const unit = await isWeighbridgeAnomaly({
    empty_weight: 1000,
    loaded_weight: 1000 + 10 * 1000 * 1.06,
    quantity_tons: 10,
  });
  if (!unit.anomaly) throw new Error(`run ${run}: unit anomaly check failed`);

  const adminToken = await loginAs("09000000000");
  const coopOpToken = await loginAs("09000000111");
  const coopAdminToken = await loginAs("09000000001");
  const consultantToken = await loginAs("09000000006");
  const driverToken = await loginAs("09000000003");

  const qty = 10;
  const missionId = await seedMission(adminToken, qty);
  const ticketId = await driverToTicket(driverToken, missionId);

  const consultantWeights = await http(`/api/weighbridge/tickets/${ticketId}/weights`, {
    method: "POST",
    headers: { Authorization: `Bearer ${consultantToken}` },
    body: JSON.stringify({ empty_weight: 1000, loaded_weight: 11000 }),
  });
  if (consultantWeights.status !== 403) {
    throw new Error(`run ${run}: CONSULTANT must not submit weights (got ${consultantWeights.status})`);
  }

  const consultantApprove = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${consultantToken}` },
  });
  if (consultantApprove.status !== 403) {
    throw new Error(`run ${run}: CONSULTANT must not approve (got ${consultantApprove.status})`);
  }

  const okWeights = await http(`/api/weighbridge/tickets/${ticketId}/weights`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopOpToken}` },
    body: JSON.stringify({ empty_weight: 1000, loaded_weight: 1000 + qty * 1000 }),
  });
  if (okWeights.status !== 200 || !okWeights.json.success) {
    throw new Error(`run ${run}: COOP_OPERATOR weights failed: ${JSON.stringify(okWeights.json)}`);
  }
  if (okWeights.json.data.ticket.status !== "LOADED_REGISTERED") {
    throw new Error(`run ${run}: expected LOADED_REGISTERED, got ${okWeights.json.data.ticket.status}`);
  }
  if (okWeights.json.data.anomaly === true) {
    throw new Error(`run ${run}: expected no anomaly for exact net`);
  }

  const auditOk = await prisma.audit_logs.count({
    where: { entity_type: "weighbridge_ticket", entity_id: String(ticketId), action: "SUBMIT_WEIGHTS" },
  });
  if (auditOk < 1) throw new Error(`run ${run}: missing SUBMIT_WEIGHTS audit`);

  const mission2 = await seedMission(adminToken, qty);
  const ticket2 = await driverToTicket(driverToken, mission2);
  const holdWeights = await http(`/api/weighbridge/tickets/${ticket2}/weights`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopOpToken}` },
    body: JSON.stringify({ empty_weight: 1000, loaded_weight: 1000 + qty * 1000 * 1.06 }),
  });
  if (holdWeights.status !== 200 || !holdWeights.json.success) {
    throw new Error(`run ${run}: anomaly weights failed: ${JSON.stringify(holdWeights.json)}`);
  }
  if (holdWeights.json.data.ticket.status !== "PENDING_HOLD") {
    throw new Error(`run ${run}: expected PENDING_HOLD, got ${holdWeights.json.data.ticket.status}`);
  }
  if (!holdWeights.json.data.anomaly) {
    throw new Error(`run ${run}: expected anomaly=true`);
  }

  const auditHold = await prisma.audit_logs.count({
    where: { entity_type: "weighbridge_ticket", entity_id: String(ticket2), action: "ANOMALY_HOLD" },
  });
  if (auditHold < 1) throw new Error(`run ${run}: missing ANOMALY_HOLD audit`);

  for (const step of ["LOADED", "IN_TRANSIT", "DELIVERED"] as const) {
    const body =
      step === "DELIVERED"
        ? { step, latitude: 35.2, longitude: 51.2 }
        : { step };
    const stepRes = await http(`/api/driver/missions/${mission2}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify(body),
    });
    if (stepRes.status !== 200) {
      throw new Error(`run ${run}: driver ${step} on PENDING_HOLD failed: ${JSON.stringify(stepRes.json)}`);
    }
  }

  const opAdminToken = await loginAs("09000000002");
  const approveHold = await http(`/api/weighbridge/tickets/${ticket2}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
  });
  if (approveHold.status !== 200 || !approveHold.json.success) {
    throw new Error(`run ${run}: OPERATION_ADMIN approve PENDING_HOLD failed: ${JSON.stringify(approveHold.json)}`);
  }

  // eslint-disable-next-line no-console
  console.log(`Run ${run} OK — ticket ok=${ticketId} hold=${ticket2}`);
}

async function main() {
  await initAppContext();
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  // eslint-disable-next-line no-console
  console.log("WB-1 test: 3/3 passed");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
