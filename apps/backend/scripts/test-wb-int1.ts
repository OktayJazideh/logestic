/**
 * WB-INT-1: weighbridge agent ingest — API key auth, idempotent readings.
 * Run: npm run test:wb-int1
 */
process.env.WEIGHBRIDGE_KEYS = JSON.stringify({ "1": "secret-key-bridge-a", "2": "secret-key-bridge-b" });

import "dotenv/config";
import { resetWeighbridgeKeysCacheForTests } from "../src/config/env";
import {
  ensureTestHttpServer,
  prisma,
  runIntegrationScript,
  testFetch as http,
} from "./lib/testHttpServer";

resetWeighbridgeKeysCacheForTests();

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

async function seedMission(adminToken: string, mineId: number, quantity_tons: number) {
  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: mineId, quantity_tons, material_type: "ORE" }),
  });
  if (seed.status !== 200 || !seed.json.success) {
    throw new Error(`devSeed failed: ${JSON.stringify(seed.json)}`);
  }
  return seed.json.data.mission.id as number;
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

async function driverToArrived(driverToken: string, missionId: number, coords?: { latitude: number; longitude: number }) {
  const lat = coords?.latitude ?? 27.0;
  const lng = coords?.longitude ?? 55.0;
  const acceptRes = await http(`/api/driver/missions/${missionId}/steps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ step: "ACCEPTED" }),
  });
  if (acceptRes.status !== 200) throw new Error(`ACCEPTED failed: ${JSON.stringify(acceptRes.json)}`);

  const arrivedRes = await http(`/api/driver/missions/${missionId}/steps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ step: "ARRIVED", latitude: lat, longitude: lng }),
  });
  if (arrivedRes.status !== 200) throw new Error(`ARRIVED failed: ${JSON.stringify(arrivedRes.json)}`);
}

async function ingest(body: Record<string, unknown>, apiKey: string) {
  return http("/api/weighbridge/ingest", {
    method: "POST",
    headers: { "X-Weighbridge-Key": apiKey },
    body: JSON.stringify(body),
  });
}

async function main() {
  await ensureTestHttpServer();

  const adminToken = await loginAs("09000000000");
  const driverToken = await loginAs("09000000003");
  await selectMine(driverToken, 1, { membership_kind: "OPERATIONAL" });

  const missionId = await seedMission(adminToken, 1, 10);
  await driverToArrived(driverToken, missionId);

  const capturedAt = new Date().toISOString();
  const payload = {
    weighbridge_id: 1,
    mission_id: missionId,
    reading_type: "empty",
    weight_kg: 12500,
    captured_at: capturedAt,
    plate: "12ب34567",
  };

  const valid = await ingest(payload, "secret-key-bridge-a");
  assert(valid.status === 200 && valid.json.success, `valid ingest failed: ${JSON.stringify(valid.json)}`);
  assert(valid.json.data.ticket_status === "EMPTY_REGISTERED", `expected EMPTY_REGISTERED, got ${valid.json.data.ticket_status}`);
  assert(valid.json.data.idempotent === false, "first ingest must not be idempotent replay");

  const ticketId = valid.json.data.ticket_id as number;
  const ticket = await prisma.weighbridge_tickets.findUnique({ where: { id: BigInt(ticketId) } });
  assert(ticket?.entry_source === "AGENT", `entry_source must be AGENT, got ${ticket?.entry_source}`);
  assert(ticket?.created_by_user_id == null, "operator_id (created_by_user_id) must be null");

  const dup = await ingest(payload, "secret-key-bridge-a");
  assert(dup.status === 200 && dup.json.success, `duplicate ingest failed: ${JSON.stringify(dup.json)}`);
  assert(dup.json.data.ticket_id === ticketId, "duplicate must return same ticket_id");
  assert(dup.json.data.idempotent === true, "duplicate must be idempotent");

  const badKey = await ingest(payload, "wrong-key");
  assert(badKey.status === 401, `wrong key must be 401, got ${badKey.status}`);

  const missionMine2 = await seedMission(adminToken, 2, 11);
  await selectMine(driverToken, 2, { membership_kind: "OPERATIONAL" });
  await driverToArrived(driverToken, missionMine2, { latitude: 28.0, longitude: 56.0 });
  const wrongMine = await ingest(
    {
      ...payload,
      mission_id: missionMine2,
      captured_at: new Date(Date.now() + 60_000).toISOString(),
    },
    "secret-key-bridge-a",
  );
  assert(wrongMine.status === 403, `wrong mine mission must be 403, got ${wrongMine.status}`);

  const events = await prisma.events.findMany({
    where: { event_name: "weighbridge.agent_ingest" },
    orderBy: { id: "desc" },
    take: 20,
  });
  assert(
    events.some((e) => {
      const p = e.payload as { ticket_id?: number };
      return p.ticket_id === ticketId;
    }),
    "weighbridge.agent_ingest event must be published",
  );

  // eslint-disable-next-line no-console
  console.log("WB-INT-1 test: PASS");
}

runIntegrationScript(main);
