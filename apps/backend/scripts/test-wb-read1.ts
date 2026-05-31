/**
 * WF-WB-READ-1: driver GET weighbridge-status — scoped 403 + payload shape.
 * Run 3x: npm run test:wb-read1
 */
import "dotenv/config";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import {
  ensureTestHttpServer,
  runIntegrationScript,
  testFetch as http,
  prisma,
} from "./lib/testHttpServer";

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

async function selectMine(token: string, mineId: number) {
  const r = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: mineId, membership_kind: "OPERATIONAL" }),
  });
  if (r.status !== 200 || !r.json.success) {
    throw new Error(`workspace select failed: ${JSON.stringify(r.json)}`);
  }
}

async function seedMission(adminToken: string) {
  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: 1, quantity_tons: 30, material_type: "ORE" }),
  });
  if (seed.status !== 200 || !seed.json.success) {
    throw new Error(`devSeed failed: ${JSON.stringify(seed.json)}`);
  }
  return seed.json.data.mission.id as number;
}

async function runOnce(run: number) {
  await ensureTestHttpServer();
  await initAppContext();

  const adminToken = await loginAs("09000000000");
  await selectMine(adminToken, 1);
  const missionId = await seedMission(adminToken);

  const driverToken = await loginAs("09000000003");
  await selectMine(driverToken, 1);

  const own = await http(`/api/driver/missions/${missionId}/weighbridge-status`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  assert(own.status === 200 && own.json.success, `run ${run}: own mission status failed: ${JSON.stringify(own.json)}`);
  const data = own.json.data;
  assert(data.ticket_status === "PENDING_EMPTY", `run ${run}: expected PENDING_EMPTY`);
  assert(data.hold_percent === 5, `run ${run}: hold_percent`);
  assert(data.payment_hold === false, `run ${run}: payment_hold false initially`);

  const otherMissionId = await seedMission(adminToken);
  const otherUser = await appContext.userStore.upsertUserByMobile(`0900000099${run}`, "DRIVER", {
    is_active: true,
  });
  const otherDriver = await appContext.entities.upsertDriver({
    user_id: otherUser.id,
    cooperative_id: 1,
    full_name: `Other Driver ${run}`,
    status: "APPROVED",
  });
  await prisma.missions.update({
    where: { id: BigInt(otherMissionId) },
    data: { driver_id: BigInt(otherDriver.id) },
  });

  const cross = await http(`/api/driver/missions/${otherMissionId}/weighbridge-status`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  assert(cross.status === 403, `run ${run}: cross-driver must be 403, got ${cross.status}`);

  console.log(`run ${run}: WF-WB-READ-1 OK (mission ${missionId})`);
}

async function main() {
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  // eslint-disable-next-line no-console
  console.log("WF-WB-READ-1 test: 3/3 passed");
}

runIntegrationScript(main);
