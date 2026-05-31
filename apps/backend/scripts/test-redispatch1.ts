/**
 * REDISPATCH-1: emergency mission cancel + re-dispatch with audit.
 * Run 3x: npm run test:redispatch1
 * Requires: db:migrate, db:seed.
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { ACTIVE_MISSION_STATUSES } from "../src/lib/missionFsm";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { clearEventsForTests, listRecentEvents } from "../src/services/eventBus";
import { closeTestHttpServer, ensureTestHttpServer, getTestBaseUrl } from "./lib/testHttpServer";

let BASE = getTestBaseUrl();

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

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function selectMine(token: string, mineId: number) {
  const r = await http("/api/mine/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: mineId }),
  });
  assert(r.status === 200 && r.json.success, `mine select failed: ${JSON.stringify(r.json)}`);
}

async function selectWorkspace(token: string, mineId: number) {
  const r = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: mineId, membership_kind: "OPERATIONAL" }),
  });
  assert(r.status === 200 && r.json.success, `workspace select failed: ${JSON.stringify(r.json)}`);
}

async function ensureRedispatchFleet(run: number) {
  await appContext.entities.hydrate();
  const fleetOwner = await appContext.entities.upsertFleetOwner({
    user_id: (await appContext.userStore.upsertUserByMobile(`0900000500${run}`, "FLEET_OWNER", { is_active: true }))
      .id,
    cooperative_id: 1,
    full_name: `مالک redispatch ${run}`,
    national_id: `fleet-redisp-${run}-${Date.now()}`,
    status: "APPROVED",
  });

  const driverA = await appContext.entities.upsertDriver({
    user_id: (await appContext.userStore.upsertUserByMobile(`0900000501${run}`, "DRIVER", { is_active: true })).id,
    cooperative_id: 1,
    full_name: `راننده redispatch A ${run}`,
    license_number: `LIC-RA-${run}`,
    status: "APPROVED",
  });

  const driverB = await appContext.entities.upsertDriver({
    user_id: (await appContext.userStore.upsertUserByMobile(`0900000502${run}`, "DRIVER", { is_active: true })).id,
    cooperative_id: 1,
    full_name: `راننده redispatch B ${run}`,
    license_number: `LIC-RB-${run}`,
    status: "APPROVED",
  });

  await appContext.entities.upsertVehicle({
    owner_id: fleetOwner.id,
    cooperative_id: 1,
    license_plate: `IR-RED-${run}-01`,
    vehicle_type: "TRUCK",
    capacity_tons: 20,
    status: "APPROVED",
  });

  await appContext.entities.upsertVehicle({
    owner_id: fleetOwner.id,
    cooperative_id: 1,
    license_plate: `IR-RED-${run}-02`,
    vehicle_type: "TRUCK",
    capacity_tons: 20,
    status: "APPROVED",
  });

  return { fleetOwner, driverA, driverB };
}

async function createAndDispatchNeed(employerToken: string, adminToken: string, run: number) {
  const create = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({
      village_id: 1,
      material_type: "ORE",
      quantity_tons: 10 + run,
      note: `redispatch test run ${run}`,
    }),
  });
  assert(create.status === 201, `create need failed: ${JSON.stringify(create.json)}`);
  const needId = create.json.data.need.id as number;

  const dispatch = await http(`/api/admin/needs/${needId}/dispatch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({}),
  });
  assert(dispatch.status === 200 && dispatch.json.success, `dispatch failed: ${JSON.stringify(dispatch.json)}`);
  const missionId = dispatch.json.data.mission_ids[0] as number;
  return { needId, missionId };
}

async function runOnce(run: number) {
  clearEventsForTests();
  await initAppContext();

  await prisma.missions.updateMany({
    where: {
      status: { in: ACTIVE_MISSION_STATUSES },
      load: { mine_id: BigInt(1) },
    },
    data: { status: "SETTLED", payment_state: "SETTLED" },
  });

  await ensureRedispatchFleet(run);

  const employerToken = await loginAs("09000000007");
  const adminToken = await loginAs("09000000000");
  const opsToken = await loginAs("09000000002");

  await selectWorkspace(opsToken, 1);
  await selectMine(employerToken, 1);

  const { needId, missionId } = await createAndDispatchNeed(employerToken, adminToken, run);

  const missingReason = await http(`/api/admin/missions/${missionId}/redispatch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opsToken}` },
    body: JSON.stringify({ reason: "short" }),
  });
  assert(missingReason.status === 400, `run ${run}: missing reason should be 400, got ${missingReason.status}`);

  const verifiedMission = await prisma.missions.update({
    where: { id: BigInt(missionId) },
    data: { status: "VERIFIED", verified_at: new Date() },
  });
  assert(verifiedMission.status === "VERIFIED", `run ${run}: failed to set VERIFIED`);

  const verifiedBlock = await http(`/api/admin/missions/${missionId}/redispatch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opsToken}` },
    body: JSON.stringify({ reason: "Emergency redispatch after weighbridge failure on route" }),
  });
  assert(
    verifiedBlock.status === 409,
    `run ${run}: VERIFIED mission should return 409, got ${verifiedBlock.status}: ${JSON.stringify(verifiedBlock.json)}`,
  );

  await prisma.missions.update({
    where: { id: BigInt(missionId) },
    data: { status: "ASSIGNED", verified_at: null },
  });
  await prisma.operation_needs.update({
    where: { id: BigInt(needId) },
    data: { status: "DISPATCHED" },
  });

  const reason = `Emergency redispatch stuck driver run ${run} — vehicle breakdown`;
  const redispatch = await http(`/api/admin/missions/${missionId}/redispatch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opsToken}` },
    body: JSON.stringify({ reason }),
  });
  assert(
    redispatch.status === 200 && redispatch.json.success,
    `run ${run}: redispatch failed: ${JSON.stringify(redispatch.json)}`,
  );

  const oldMission = await prisma.missions.findUnique({ where: { id: BigInt(missionId) } });
  assert(oldMission?.status === "CANCELLED", `run ${run}: old mission should be CANCELLED, got ${oldMission?.status}`);

  const newMissionIds = redispatch.json.data.mission_ids as number[];
  assert(newMissionIds.length >= 1, `run ${run}: expected new mission ids`);
  const newMissionId = newMissionIds.find((id) => id !== missionId);
  assert(newMissionId != null, `run ${run}: expected a new mission id distinct from old`);
  const newMission = await prisma.missions.findUnique({ where: { id: BigInt(newMissionId) } });
  assert(
    newMission?.status === "ASSIGNED" || newMission?.status === "CREATED",
    `run ${run}: new mission should be CREATED/ASSIGNED, got ${newMission?.status}`,
  );

  const audit = await prisma.audit_logs.findFirst({
    where: { entity_type: "mission", entity_id: String(missionId), action: "mission.redispatch" },
    orderBy: { created_at: "desc" },
  });
  assert(audit != null, `run ${run}: audit mission.redispatch missing`);
  const after = audit.after_value as { reason?: string; old_mission_id?: number; need_id?: number };
  assert(after.reason === reason, `run ${run}: audit reason mismatch`);
  assert(after.old_mission_id === missionId, `run ${run}: audit old_mission_id mismatch`);
  assert(after.need_id === needId, `run ${run}: audit need_id mismatch`);

  const events = listRecentEvents(30);
  assert(
    events.some((e) => e.event_name === "mission.redispatched"),
    `run ${run}: mission.redispatched event missing in-memory`,
  );

  const persistedEvent = await prisma.events.findFirst({
    where: { event_name: "mission.redispatched" },
    orderBy: { occurred_at: "desc" },
  });
  assert(persistedEvent != null, `run ${run}: mission.redispatched not persisted`);
  const payload = persistedEvent.payload as { old_mission_id?: number; need_id?: number };
  assert(payload.old_mission_id === missionId, `run ${run}: event old_mission_id mismatch`);
  assert(payload.need_id === needId, `run ${run}: event need_id mismatch`);

  console.log(`redispatch1 run ${run}: OK (old=${missionId} CANCELLED, new=${newMissionId} ${newMission?.status})`);
}

async function main() {
  BASE = await ensureTestHttpServer();
  for (let run = 1; run <= 3; run += 1) {
    await runOnce(run);
  }
  await closeTestHttpServer();
  console.log("test:redispatch1 — all 3 runs PASS");
}

main().catch(async (e) => {
  console.error(e);
  await closeTestHttpServer();
  process.exit(1);
});
