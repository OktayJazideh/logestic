/**
 * KPI-1: daily snapshots, queue job, dashboard API, healthz, pino logging.
 * Run 3x: npm run test:kpi1
 */
import "dotenv/config";
import { jobQueue } from "../src/queues/jobQueue";
import { computeDailyKpis } from "../src/services/kpiService";
import { deleteSnapshotsForTests } from "../src/repositories/kpiRepository";
import { buildHealthPayload } from "../src/routes/health";
import {
  ensureTestHttpServer,
  runIntegrationScript,
  testFetch as http,
  prisma,
} from "./lib/testHttpServer";

const MINE_ID = 1;

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
    throw new Error(`verify failed: ${JSON.stringify(verify.json)}`);
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

async function seedKpiData(run: number, snapshotDate: string) {
  const start = new Date(`${snapshotDate}T00:00:00.000Z`);
  const load = await prisma.loads.findFirst({ where: { mine_id: BigInt(MINE_ID) } });
  if (!load) throw new Error("no load for mine 1 — run db seed first");

  const owner = await prisma.fleet_owners.findFirst();
  const driver = await prisma.drivers.findFirst();
  const vehicle = await prisma.vehicles.findFirst();
  if (!owner || !driver || !vehicle) throw new Error("missing fleet owner/driver/vehicle");

  const assigned = await prisma.missions.create({
    data: {
      load_id: load.id,
      owner_id: owner.id,
      driver_id: driver.id,
      vehicle_id: vehicle.id,
      status: "ASSIGNED",
      created_at: start,
      updated_at: start,
    },
  });

  const verifiedOnTime = await prisma.missions.create({
    data: {
      load_id: load.id,
      owner_id: owner.id,
      driver_id: driver.id,
      vehicle_id: vehicle.id,
      status: "VERIFIED",
      started_at: new Date(start.getTime() + 1 * 60 * 60 * 1000),
      verified_at: new Date(start.getTime() + 4 * 60 * 60 * 1000),
      created_at: start,
      updated_at: start,
    },
  });

  const verifiedDelayed = await prisma.missions.create({
    data: {
      load_id: load.id,
      owner_id: owner.id,
      driver_id: driver.id,
      vehicle_id: vehicle.id,
      status: "VERIFIED",
      started_at: start,
      verified_at: new Date(start.getTime() + 12 * 60 * 60 * 1000),
      created_at: start,
      updated_at: start,
    },
  });

  await prisma.missions.create({
    data: {
      load_id: load.id,
      owner_id: owner.id,
      driver_id: driver.id,
      vehicle_id: vehicle.id,
      status: "DELIVERED",
      payment_state: "HELD",
      created_at: start,
      updated_at: start,
    },
  });

  await prisma.settlement_batches.create({
    data: {
      mine_id: BigInt(MINE_ID),
      period_start: start,
      period_end: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000),
      status: "FAILED",
      updated_at: new Date(start.getTime() + 2 * 60 * 60 * 1000),
    },
  });

  return { assigned, verifiedOnTime, verifiedDelayed, run };
}

async function runOnce(run: number) {
  await ensureTestHttpServer();
  jobQueue.resetForTests();
  await deleteSnapshotsForTests(MINE_ID);

  const snapshotDate = `2098-0${run}-15`;
  await seedKpiData(run, snapshotDate);

  const syncResult = await computeDailyKpis(new Date(`${snapshotDate}T00:00:00.000Z`), MINE_ID);
  assert(syncResult.mines.length >= 1, "compute returned no mines");

  const rows = await prisma.kpi_snapshots.findMany({
    where: { mine_id: BigInt(MINE_ID), snapshot_date: new Date(`${snapshotDate}T00:00:00.000Z`) },
  });
  assert(rows.length >= 10, `expected KPI rows, got ${rows.length}`);

  const efficiency = rows.find((r) => r.key === "fleet_efficiency");
  assert(efficiency != null, "fleet_efficiency missing");
  assert(Number(efficiency.value) > 0 && Number(efficiency.value) <= 1, "fleet_efficiency out of range");

  const delayPct = rows.find((r) => r.key === "delay_pct");
  assert(delayPct != null && Number(delayPct.value) > 0, "delay_pct should be > 0 for seeded delayed mission");

  const failed = rows.find((r) => r.key === "failed_settlement");
  assert(failed != null && Number(failed.value) >= 1, "failed_settlement should count batch");

  const job = await jobQueue.enqueue(
    "kpi",
    "daily-snapshot",
    { date: snapshotDate, mine_id: MINE_ID },
    { wait: true },
  );
  assert(job.status === "completed", `queue job failed: ${job.error}`);

  const health = await buildHealthPayload();
  assert(health.ok === true, "buildHealthPayload not ok");
  assert(health.checks.database.ok, "database check failed");

  const healthz = await http("/api/healthz");
  assert(healthz.status === 200 && healthz.json.ok === true, "GET /api/healthz failed");

  const adminToken = await loginAs(process.env.DEV_ADMIN_MOBILE ?? "09000000000");
  const dash = await http(
    `/api/admin/kpi/dashboard?from=${snapshotDate}&to=${snapshotDate}&mine_id=${MINE_ID}`,
    { headers: { Authorization: `Bearer ${adminToken}` } },
  );
  assert(dash.status === 200 && dash.json.success, `dashboard API: ${JSON.stringify(dash.json)}`);
  assert(dash.json.data.dashboard.series.length >= 1, "dashboard series empty");

  const computeApi = await http("/api/admin/kpi/compute", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ date: snapshotDate, mine_id: MINE_ID }),
  });
  assert(computeApi.status === 200 && computeApi.json.success, "compute API failed");

  const opToken = await loginAs("09000000002");
  await selectWorkspace(opToken, MINE_ID);
  const opsDash = await http("/api/admin/ops-dashboard", {
    headers: { Authorization: `Bearer ${opToken}` },
  });
  assert(opsDash.status === 200 && opsDash.json.success, `WF-OPS-DASH regression: ${JSON.stringify(opsDash.json)}`);
  const ops = opsDash.json.data.dashboard;
  assert(ops.missions_trend_7d?.length === 7, "ops-dashboard trend 7d");
  assert(typeof ops.missions_today?.in_progress === "number", "ops-dashboard in_progress");

  // eslint-disable-next-line no-console
  console.log(`KPI-1 run ${run}: OK (${rows.length} snapshots + ops-dashboard)`);
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  // eslint-disable-next-line no-console
  console.log("KPI-1: all 3 runs OK");
}

runIntegrationScript(main);
