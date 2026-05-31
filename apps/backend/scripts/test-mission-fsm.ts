/**
 * MISSION-FSM-1: 9-state mission lifecycle tests.
 * Run 3x: npm run test:fsm1
 * Unit tests (FSM lib) always run; HTTP integration if TEST_BASE_URL server is up.
 */
import "dotenv/config";
import {
  allLegalTransitions,
  canActorTransition,
  DRIVER_STEP_TARGETS,
  expectedNext,
  validateTransition,
} from "../src/lib/missionFsm";
import { prisma } from "../src/db/prisma";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4000";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function runFsmUnitTests(run: number) {
  const legal = allLegalTransitions();
  assert(legal.length === 8, `run ${run}: expected 8 legal edges, got ${legal.length}`);

  for (const { from, to, actor } of legal) {
    assert(expectedNext(from) === to, `run ${run}: next(${from}) should be ${to}`);
    assert(canActorTransition(from, to, actor), `run ${run}: ${from}->${to} for ${actor}`);
    assert(validateTransition(from, to, actor).ok, `run ${run}: validate ${from}->${to}`);
  }

  assert(!canActorTransition("ASSIGNED", "ARRIVED", "DRIVER"), `run ${run}: skip ACCEPTED must fail`);
  assert(!validateTransition("ASSIGNED", "ARRIVED", "DRIVER").ok, `run ${run}: illegal skip`);
  assert(!canActorTransition("DELIVERED", "ACCEPTED", "DRIVER"), `run ${run}: backward must fail`);
  assert(!validateTransition("DELIVERED", "ACCEPTED", "DRIVER").ok, `run ${run}: illegal backward`);

  assert(DRIVER_STEP_TARGETS.length === 5, `run ${run}: driver targets count`);
  console.log(`FSM unit run ${run}: OK (${legal.length} legal transitions, 2 illegal rejected)`);
}

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

async function runHttpIntegration(run: number) {
  const adminToken = await loginAs("09000000000");
  const driverToken = await loginAs("09000000003");
  const coopOpToken = await loginAs("09000000111");
  const opAdminToken = await loginAs("09000000002");

  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: 1, quantity_tons: 4 + run * 0.1, material_type: "ORE" }),
  });
  assert(seed.status === 200 && seed.json.success, `run ${run}: seed failed`);
  const missionId = seed.json.data.mission.id as number;
  assert(seed.json.data.mission.status === "ASSIGNED", `run ${run}: demo mission should be ASSIGNED`);

  const illegalSkip = await http(`/api/driver/missions/${missionId}/steps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ step: "ARRIVED", latitude: 35.1, longitude: 51.1 }),
  });
  assert(illegalSkip.status === 409, `run ${run}: skip ACCEPTED must 409`);
  assert(illegalSkip.json.error?.code === "invalid_transition", `run ${run}: expected invalid_transition`);

  const accept = await http(`/api/driver/missions/${missionId}/steps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ step: "ACCEPTED" }),
  });
  assert(accept.status === 200, `run ${run}: ACCEPTED failed`);

  const arrived = await http(`/api/driver/missions/${missionId}/steps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ step: "ARRIVED", latitude: 35.2, longitude: 51.2 }),
  });
  assert(arrived.status === 200, `run ${run}: ARRIVED failed`);

  const ticketRes = await http(`/api/driver/missions/${missionId}/ticket`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const ticketId = ticketRes.json?.data?.ticket?.id as number;
  assert(ticketId, `run ${run}: ticket missing after ARRIVED`);

  const weights = await http(`/api/weighbridge/tickets/${ticketId}/weights`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopOpToken}` },
    body: JSON.stringify({ empty_weight: 10, loaded_weight: 14 + run * 0.1 }),
  });
  assert(weights.status === 200, `run ${run}: weights failed`);

  for (const step of ["LOADED", "IN_TRANSIT", "DELIVERED"] as const) {
    const body =
      step === "DELIVERED"
        ? { step, latitude: 35.3, longitude: 51.3 }
        : step === "IN_TRANSIT"
          ? { step }
          : { step };
    const r = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify(body),
    });
    assert(r.status === 200, `run ${run}: step ${step} failed: ${JSON.stringify(r.json)}`);
  }

  const illegalBack = await http(`/api/driver/missions/${missionId}/steps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ step: "ACCEPTED" }),
  });
  assert(illegalBack.status === 409, `run ${run}: backward must 409`);

  const approve = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
  });
  assert(approve.status === 200, `run ${run}: approve failed: ${JSON.stringify(approve.json)}`);

  const row = await prisma.missions.findUnique({ where: { id: BigInt(missionId) } });
  assert(row?.status === "VERIFIED", `run ${run}: expected VERIFIED, got ${row?.status}`);

  console.log(`FSM HTTP run ${run}: OK mission=${missionId}`);
}

async function main() {
  let httpOk = false;
  try {
    const health = await fetch(`${BASE}/api/health`);
    httpOk = health.ok;
  } catch {
    httpOk = false;
  }

  for (let i = 1; i <= 3; i++) {
    runFsmUnitTests(i);
    if (httpOk) {
      await runHttpIntegration(i);
    }
  }

  if (!httpOk) {
    console.log("FSM HTTP integration skipped (server not reachable at TEST_BASE_URL)");
  }
  console.log("MISSION-FSM-1: all 3 runs passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
