/**
 * WF-OPS-DASH-1: GET /api/admin/ops-dashboard — mine-scoped KPIs + trend.
 * Run 3x: npm run test:ops-dash1
 */
import "dotenv/config";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import * as communityPoolsRepo from "../src/repositories/communityPoolsRepository";
import { ACTIVE_MISSION_STATUSES } from "../src/lib/missionFsm";
import {
  ensureTestHttpServer,
  runIntegrationScript,
  testFetch as http,
  prisma,
} from "./lib/testHttpServer";

const MINE_ID = 1;
const OP_MOBILE = "09000000002";
const DRIVER_MOBILE = "09000000003";

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

type OpsDash = {
  missions_today: { created: number; verified: number; in_progress: number };
  weighbridge_pending: number;
  pool_current_rial: number;
  pool_period_key: string;
  holds_active: number;
  needs_pending_dispatch: number;
  missions_trend_7d: Array<{ date: string; created: number; verified: number }>;
  latest_missions: Array<{ id: number; status: string; driver_name: string; tons: number | null }>;
  last_updated: string;
};

function mineWhere() {
  return { load: { mine_id: BigInt(MINE_ID) } };
}

async function expectedCounts() {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const periodKey = now.toISOString().slice(0, 7);
  const pool = await communityPoolsRepo.findPoolByMinePeriod(MINE_ID, periodKey);

  const [
    createdToday,
    verifiedToday,
    inProgress,
    wbPending,
    holdsActive,
    needsPending,
  ] = await Promise.all([
    prisma.missions.count({
      where: { ...mineWhere(), created_at: { gte: todayStart, lt: todayEnd } },
    }),
    prisma.missions.count({
      where: { ...mineWhere(), verified_at: { gte: todayStart, lt: todayEnd } },
    }),
    prisma.missions.count({
      where: { ...mineWhere(), status: { in: ACTIVE_MISSION_STATUSES } },
    }),
    prisma.weighbridge_tickets.count({
      where: {
        status: { in: ["PENDING_HOLD", "LOADED_REGISTERED"] },
        mission: mineWhere(),
      },
    }),
    prisma.missions.count({
      where: {
        ...mineWhere(),
        OR: [{ payment_state: "HELD" }, { weighbridge_tickets: { status: "PENDING_HOLD" } }],
      },
    }),
    prisma.operation_needs.count({
      where: { mine_id: BigInt(MINE_ID), status: "PENDING", deleted_at: null },
    }),
  ]);

  return {
    periodKey,
    poolRial: pool?.total_amount ?? 0,
    createdToday,
    verifiedToday,
    inProgress,
    wbPending,
    holdsActive,
    needsPending,
  };
}

async function fetchOpsDash(token: string) {
  return http("/api/admin/ops-dashboard", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function assertDashboardMatchesDb(run: number, dash: OpsDash, exp: Awaited<ReturnType<typeof expectedCounts>>) {
  assert(dash.missions_today.created === exp.createdToday, `run ${run}: created today`);
  assert(dash.missions_today.verified === exp.verifiedToday, `run ${run}: verified today`);
  assert(dash.missions_today.in_progress === exp.inProgress, `run ${run}: in_progress`);
  assert(dash.weighbridge_pending === exp.wbPending, `run ${run}: weighbridge_pending`);
  assert(dash.holds_active === exp.holdsActive, `run ${run}: holds_active`);
  assert(dash.needs_pending_dispatch === exp.needsPending, `run ${run}: needs_pending_dispatch`);
  assert(dash.pool_period_key === exp.periodKey, `run ${run}: pool_period_key`);
  assert(dash.pool_current_rial === exp.poolRial, `run ${run}: pool_current_rial`);
}

async function runOnce(run: number) {
  await ensureTestHttpServer();
  await initAppContext();
  await appContext.mineData.hydrate();

  const opToken = await loginAs(OP_MOBILE);

  const beforeMine = await fetchOpsDash(opToken);
  assert(beforeMine.status === 400, `run ${run}: mine_not_selected expected 400, got ${beforeMine.status}`);
  assert(
    beforeMine.json?.error?.code === "mine_not_selected",
    `run ${run}: expected mine_not_selected code`,
  );

  await selectWorkspace(opToken, MINE_ID);

  const exp0 = await expectedCounts();
  const res0 = await fetchOpsDash(opToken);
  assert(res0.status === 200 && res0.json.success, `run ${run}: ops-dashboard: ${JSON.stringify(res0.json)}`);
  const dash0 = res0.json.data.dashboard as OpsDash;
  assertDashboardMatchesDb(run, dash0, exp0);

  assert(dash0.missions_trend_7d.length === 7, `run ${run}: trend length`);
  for (let i = 1; i < dash0.missions_trend_7d.length; i++) {
    assert(
      dash0.missions_trend_7d[i - 1].date < dash0.missions_trend_7d[i].date,
      `run ${run}: trend dates must be ascending`,
    );
  }

  assert(dash0.latest_missions.length <= 5, `run ${run}: latest_missions cap`);
  for (const m of dash0.latest_missions) {
    assert(typeof m.id === "number" && m.id > 0, `run ${run}: mission id`);
    assert(typeof m.status === "string" && m.status.length > 0, `run ${run}: status`);
    assert(typeof m.driver_name === "string" && m.driver_name.length > 0, `run ${run}: driver_name`);
  }
  assert(new Date(dash0.last_updated).toString() !== "Invalid Date", `run ${run}: last_updated ISO`);

  const driverToken = await loginAs(DRIVER_MOBILE);
  await selectWorkspace(driverToken, MINE_ID);
  const driverDenied = await fetchOpsDash(driverToken);
  assert(driverDenied.status === 403, `run ${run}: DRIVER must get 403, got ${driverDenied.status}`);

  const load = await prisma.loads.findFirst({ where: { mine_id: BigInt(MINE_ID) } });
  const owner = await prisma.fleet_owners.findFirst();
  const driver = await prisma.drivers.findFirst();
  const vehicle = await prisma.vehicles.findFirst();
  assert(load && owner && driver && vehicle, `run ${run}: seed entities missing`);

  const today = new Date();
  const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  await prisma.missions.create({
    data: {
      load_id: load.id,
      owner_id: owner.id,
      driver_id: driver.id,
      vehicle_id: vehicle.id,
      status: "ASSIGNED",
      created_at: todayStart,
      updated_at: todayStart,
    },
  });

  const exp1 = await expectedCounts();
  const res1 = await fetchOpsDash(opToken);
  const dash1 = res1.json.data.dashboard as OpsDash;
  assertDashboardMatchesDb(run, dash1, exp1);
  assert(
    dash1.missions_today.created === exp0.createdToday + 1,
    `run ${run}: created today should increment by 1`,
  );

  const otherMine = await prisma.mines.findFirst({ where: { id: { not: BigInt(MINE_ID) } } });
  if (otherMine) {
    const op2 = await loginAs("09000000103");
    await selectWorkspace(op2, Number(otherMine.id));
    const cross = await fetchOpsDash(op2);
    assert(cross.status === 200 && cross.json.success, `run ${run}: mine2 dashboard`);
    const d2 = cross.json.data.dashboard as OpsDash;
    const expOther = await prisma.missions.count({
      where: {
        load: { mine_id: otherMine.id },
        status: { in: ACTIVE_MISSION_STATUSES },
      },
    });
    assert(
      d2.missions_today.in_progress === expOther,
      `run ${run}: mine2 in_progress must match DB for mine ${otherMine.id}`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    `WF-OPS-DASH-1 run ${run}: OK (created=${dash1.missions_today.created}, in_progress=${dash1.missions_today.in_progress}, wb=${dash1.weighbridge_pending})`,
  );
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  // eslint-disable-next-line no-console
  console.log("WF-OPS-DASH-1: all 3 runs passed");
}

runIntegrationScript(main);
