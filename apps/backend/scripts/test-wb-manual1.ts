/**
 * WB-MANUAL-1: manual weighbridge failover — permission gate, audit, supervisor approve.
 * Run 3x: npm run test:wb-manual1
 */
import "dotenv/config";
import {
  ensureTestHttpServer,
  runIntegrationScript,
  testFetch as http,
} from "./lib/testHttpServer";
import { prisma } from "../src/db/prisma";

const MANUAL_NOTE =
  "باسکول خاموش است و وزن از صورت دستی اپراتور ثبت شد برای ادامه مأموریت";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
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

async function selectMine(
  token: string,
  mineId: number,
  opts?: { cooperative_id?: number; membership_kind?: "COMMUNITY" | "OPERATIONAL" },
) {
  const r = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      mine_id: mineId,
      cooperative_id: opts?.cooperative_id,
      membership_kind: opts?.membership_kind,
    }),
  });
  if (r.status !== 200 || !r.json.success) {
    throw new Error(`workspace select failed: ${JSON.stringify(r.json)}`);
  }
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
    body: JSON.stringify({ step: "ARRIVED", latitude: 27.0, longitude: 55.0 }),
  });
  if (arrivedRes.status !== 200) throw new Error(`ARRIVED failed: ${JSON.stringify(arrivedRes.json)}`);

  const ticketRes = await http(`/api/driver/missions/${missionId}/ticket`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const ticketId = ticketRes.json?.data?.ticket?.id as number;
  if (!ticketId) throw new Error("no ticket after ARRIVED");
  return ticketId;
}

async function driverToDelivered(driverToken: string, missionId: number) {
  for (const step of ["LOADED", "IN_TRANSIT", "DELIVERED"] as const) {
    const body =
      step === "DELIVERED"
        ? { step, latitude: 27.05, longitude: 55.05 }
        : { step };
    const stepRes = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify(body),
    });
    if (stepRes.status !== 200) {
      throw new Error(`driver ${step} failed: ${JSON.stringify(stepRes.json)}`);
    }
  }
}

async function runOnce(run: number) {
  const adminToken = await loginAs("09000000000");
  const coopOpToken = await loginAs("09000000111");
  const opAdminToken = await loginAs("09000000002");
  const driverToken = await loginAs("09000000003");

  await selectMine(coopOpToken, 1, { cooperative_id: 1, membership_kind: "COMMUNITY" });
  await selectMine(opAdminToken, 1);
  await selectMine(driverToken, 1, { membership_kind: "OPERATIONAL" });

  const qty = 10;
  const missionId = await seedMission(adminToken, qty + run * 0.01);
  const ticketId = await driverToTicket(driverToken, missionId);

  const manualBody = {
    empty_weight: 1000,
    loaded_weight: 1000 + qty * 1000,
    entry_source: "MANUAL",
    entry_note: MANUAL_NOTE,
    reason_code: "SCALE_DOWN",
  };

  const coopManual = await http(`/api/weighbridge/tickets/${ticketId}/weights`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopOpToken}` },
    body: JSON.stringify(manualBody),
  });
  assert(coopManual.status === 403, `run ${run}: COOP_OPERATOR + MANUAL must be 403 (got ${coopManual.status})`);

  const opManual = await http(`/api/weighbridge/tickets/${ticketId}/weights`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
    body: JSON.stringify(manualBody),
  });
  assert(opManual.status === 200 && opManual.json.success, `run ${run}: OPERATION_ADMIN MANUAL failed: ${JSON.stringify(opManual.json)}`);
  assert(
    opManual.json.data.ticket.status === "PENDING_HOLD",
    `run ${run}: expected PENDING_HOLD, got ${opManual.json.data.ticket.status}`,
  );
  assert(
    opManual.json.data.ticket.requires_supervisor_approve === true,
    `run ${run}: requires_supervisor_approve must be true`,
  );

  const auditCount = await prisma.audit_logs.count({
    where: {
      entity_type: "weighbridge_ticket",
      entity_id: String(ticketId),
      action: "weighbridge.manual_entry",
    },
  });
  assert(auditCount >= 1, `run ${run}: missing weighbridge.manual_entry audit`);

  await driverToDelivered(driverToken, missionId);

  const coopApprove = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopOpToken}` },
  });
  assert(
    coopApprove.status === 409 && coopApprove.json?.error?.code === "supervisor_approval_required",
    `run ${run}: COOP approve manual must be 409 supervisor_approval_required (got ${coopApprove.status})`,
  );

  const opApprove = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
  });
  assert(opApprove.status === 200 && opApprove.json.success, `run ${run}: OPERATION_ADMIN approve failed: ${JSON.stringify(opApprove.json)}`);

  // eslint-disable-next-line no-console
  console.log(`Run ${run} OK — ticket=${ticketId} mission=${missionId}`);
}

async function main() {
  await ensureTestHttpServer();
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  // eslint-disable-next-line no-console
  console.log("WB-MANUAL-1 test: 3/3 passed");
}

runIntegrationScript(main);
