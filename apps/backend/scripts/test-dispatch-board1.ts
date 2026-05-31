/**
 * WF-DISPATCH-BOARD-1: GET /api/admin/dispatch-board + POST dispatch mine-scoped.
 * Run 3x: npm run test:dispatch-board1
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/db/prisma";
import { ACTIVE_MISSION_STATUSES } from "../src/lib/missionFsm";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { ensureTestHttpServer, runIntegrationScript, testFetch as http } from "./lib/testHttpServer";

const MINE_ID = 1;
const OP_MOBILE = "09000000002";
const EMPLOYER_MOBILE = "09000000007";

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

async function selectWorkspace(token: string, mineId: number) {
  const r = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: mineId, membership_kind: "OPERATIONAL" }),
  });
  assert(r.status === 200 && r.json.success, `workspace select failed: ${JSON.stringify(r.json)}`);
}

async function ensureDispatchFleet(run: number) {
  await appContext.entities.hydrate();
  const fleetOwner = await appContext.entities.upsertFleetOwner({
    user_id: (
      await appContext.userStore.upsertUserByMobile(`0900000500${run}`, "FLEET_OWNER", { is_active: true })
    ).id,
    cooperative_id: 1,
    full_name: `مالک بورد ${run}`,
    national_id: `fleet-board-${run}-${Date.now()}`,
    status: "APPROVED",
  });
  const driver = await appContext.entities.upsertDriver({
    user_id: (await appContext.userStore.upsertUserByMobile(`0900000501${run}`, "DRIVER", { is_active: true })).id,
    cooperative_id: 1,
    full_name: `راننده بورد ${run}`,
    license_number: `LIC-BOARD-${run}`,
    status: "APPROVED",
  });
  await appContext.entities.upsertVehicle({
    owner_id: fleetOwner.id,
    cooperative_id: 1,
    license_plate: `IR-BOARD-${run}`,
    vehicle_type: "TRUCK",
    capacity_tons: 30,
    status: "APPROVED",
  });
  return { driver };
}

async function runOnce(run: number) {
  await prisma.missions.updateMany({
    where: {
      status: { in: ACTIVE_MISSION_STATUSES },
      load: { mine_id: BigInt(MINE_ID) },
    },
    data: { status: "SETTLED", payment_state: "SETTLED" },
  });
  await ensureDispatchFleet(run);

  const adminToken = await loginAs("09000000000");
  await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: MINE_ID, quantity_tons: 1, material_type: "ORE" }),
  });

  const employerToken = await loginAs(EMPLOYER_MOBILE);
  await selectWorkspace(employerToken, MINE_ID);
  const needRes = await http("/api/employer/needs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${employerToken}`,
      "Idempotency-Key": randomUUID(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      village_id: 1,
      material_type: "ORE",
      quantity_tons: 1,
      note: `dispatch-board1 run ${run}`,
    }),
  });
  assert(needRes.status === 201 && needRes.json.success, `create need: ${JSON.stringify(needRes.json)}`);
  const needId = needRes.json.data.need.id as number;

  const opToken = await loginAs(OP_MOBILE);
  await selectWorkspace(opToken, MINE_ID);

  const boardBefore = await http("/api/admin/dispatch-board", {
    headers: { Authorization: `Bearer ${opToken}` },
  });
  assert(boardBefore.status === 200 && boardBefore.json.success, `board: ${JSON.stringify(boardBefore.json)}`);
  const cols = boardBefore.json.data.columns;
  assert(Array.isArray(cols.PENDING_NEEDS), "PENDING_NEEDS array");
  assert(cols.PENDING_NEEDS.some((n: { need_id: number }) => n.need_id === needId), "need in PENDING");
  assert(boardBefore.json.data.generated_at, "generated_at");

  const dispatch = await http("/api/admin/dispatch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opToken}`,
      "Idempotency-Key": randomUUID(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ need_id: needId }),
  });
  assert(dispatch.status === 200 && dispatch.json.success, `dispatch: ${JSON.stringify(dispatch.json)}`);
  assert((dispatch.json.data.mission_ids as number[]).length >= 1, "mission_ids");

  const boardAfter = await http("/api/admin/dispatch-board", {
    headers: { Authorization: `Bearer ${opToken}` },
  });
  const pendingAfter = boardAfter.json.data.columns.PENDING_NEEDS as Array<{ need_id: number }>;
  assert(!pendingAfter.some((n) => n.need_id === needId), "need left PENDING after dispatch");
  const dispatched = boardAfter.json.data.columns.DISPATCHED as Array<{ need_id: number; missions: unknown[] }>;
  assert(
    dispatched.some((d) => d.need_id === needId && d.missions.length > 0),
    "need in DISPATCHED with missions",
  );

  console.log(`WF-DISPATCH-BOARD-1 run ${run}: OK (need ${needId})`);
}

async function main() {
  await ensureTestHttpServer();
  await initAppContext();
  await appContext.mineData.hydrate();
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  // eslint-disable-next-line no-console
  console.log("WF-DISPATCH-BOARD-1: all 3 runs passed");
}

runIntegrationScript(main);
