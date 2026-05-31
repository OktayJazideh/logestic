/**
 * HH-API-1: household shares + pool status API for community_app.
 * Run 3x: npm run test:hh-api1
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { prisma } from "../src/db/prisma";
import * as communityPoolsRepo from "../src/repositories/communityPoolsRepository";
import * as householdsRepo from "../src/repositories/householdsRepository";
import * as usersRepo from "../src/repositories/usersRepository";
import * as walletsRepo from "../src/repositories/walletsRepository";
import { toDecimal } from "../src/repositories/decimal";
import { ruleEngine } from "../src/services/ruleEngine";

const MINE_ID = 1;
const PERIOD_KEY = "2026-06";
const POOL_TOTAL = 9_000_000;

let testServer: Server | null = null;
let baseUrl = "";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function ensureTestServer(): Promise<string> {
  if (baseUrl) return baseUrl;
  await initAppContext();
  const app = createApp();
  return new Promise((resolve, reject) => {
    testServer = createServer(app);
    testServer.listen(0, "127.0.0.1", () => {
      const addr = testServer!.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Could not bind test server"));
        return;
      }
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve(baseUrl);
    });
    testServer.on("error", reject);
  });
}

async function http(path: string, init?: RequestInit) {
  const root = await ensureTestServer();
  const res = await fetch(`${root}${path}`, {
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

async function ensureRules() {
  const admin = await prisma.users.findFirst({ where: { mobile_number: "09000000000" } });
  const uid = admin ? Number(admin.id) : 1;
  const epoch = new Date("2026-01-01T00:00:00.000Z");
  const scope = { type: "GLOBAL" as const };
  await ruleEngine.setActive("community.rial_per_verified_ton", 500_000, scope, epoch, uid);
}

async function seedHouseholdWithPool(run: number): Promise<{ householdId: number; mobile: string }> {
  const mobile = `09000004${run}01`;
  const u = await usersRepo.upsertUserByMobile(mobile, "HOUSEHOLD", { is_active: true });
  const h = await householdsRepo.upsertHousehold({
    user_id: u.id,
    village_id: 1,
    cooperative_id: 1,
    head_name: `خانوار HH-API ${run}`,
    national_id: `HHAPI${run}${Date.now()}`.slice(0, 10),
    status: "APPROVED",
  });

  await prisma.$transaction(async (tx) => {
    await walletsRepo.findOrCreateHouseholdWallet(h.id, tx);
  });

  await prisma.community_pools.deleteMany({
    where: { mine_id: BigInt(MINE_ID), period_key: PERIOD_KEY },
  });

  const snapshotIds = await householdsRepo.listApprovedHouseholdIdsByMine(MINE_ID);
  assert(snapshotIds.includes(h.id), `run ${run}: household must be in mine snapshot`);

  const pool = await prisma.community_pools.create({
    data: {
      mine_id: BigInt(MINE_ID),
      period_key: PERIOD_KEY,
      total_amount: toDecimal(POOL_TOTAL),
      status: "SNAPSHOT_LOCKED",
      households_snapshot: snapshotIds,
    },
  });

  const dist = await communityPoolsRepo.distributePool(Number(pool.id));
  if (!dist.ok) throw new Error(`run ${run}: distribute failed: ${dist.reason}`);

  return { householdId: h.id, mobile };
}

async function runOnce(run: number) {
  await appContext.entities.hydrate();
  await ensureRules();
  const { mobile } = await seedHouseholdWithPool(run);

  const hhToken = await loginAs(mobile);
  const coopToken = await loginAs("09000000001");

  const shares = await http(`/api/household/shares?period=${PERIOD_KEY}`, {
    headers: { Authorization: `Bearer ${hhToken}` },
  });
  assert(shares.status === 200 && shares.json.success, `run ${run}: shares failed: ${JSON.stringify(shares.json)}`);
  const data = shares.json.data;
  assert(data.period_key === PERIOD_KEY, `run ${run}: period_key mismatch`);
  assert(typeof data.community_rial_per_ton === "number" && data.community_rial_per_ton > 0, `run ${run}: rate missing`);
  assert(Array.isArray(data.shares) && data.shares.length > 0, `run ${run}: shares must be non-empty`);
  assert(data.shares[0].source === "POOL_DISTRIBUTION", `run ${run}: expected POOL_DISTRIBUTION source`);
  assert(data.shares[0].status === "CALCULATED" || data.shares[0].status === "PAID", `run ${run}: invalid status`);
  assert(data.total_rial > 0, `run ${run}: total_rial must be positive`);
  assert(!JSON.stringify(data).includes("0.13"), `run ${run}: must not expose fare percentage`);

  const wrongPeriod = await http("/api/household/shares?period=2026-01", {
    headers: { Authorization: `Bearer ${hhToken}` },
  });
  assert(wrongPeriod.status === 200 && wrongPeriod.json.success, `run ${run}: wrong period request failed`);
  assert(
    wrongPeriod.json.data.shares.length === 0 && wrongPeriod.json.data.total_rial === 0,
    `run ${run}: period filter must return empty for 2026-01`,
  );

  const poolStatus = await http(`/api/household/pool-status?period=${PERIOD_KEY}`, {
    headers: { Authorization: `Bearer ${hhToken}` },
  });
  assert(poolStatus.status === 200 && poolStatus.json.success, `run ${run}: pool-status failed`);
  const pool = poolStatus.json.data;
  assert(pool.pool_status === "DISTRIBUTED", `run ${run}: pool must be DISTRIBUTED`);
  assert(pool.distributed === true, `run ${run}: distributed flag`);
  assert(pool.pool_total_rial === POOL_TOTAL, `run ${run}: pool total mismatch`);
  assert(pool.household_count > 0, `run ${run}: household_count missing`);
  assert(
    pool.estimated_share_rial === Math.floor(POOL_TOTAL / pool.household_count),
    `run ${run}: estimated share wrong`,
  );

  const coopShares = await http(`/api/household/shares?period=${PERIOD_KEY}`, {
    headers: { Authorization: `Bearer ${coopToken}` },
  });
  assert(coopShares.status === 403, `run ${run}: non-HOUSEHOLD must get 403 on shares`);

  const coopPool = await http(`/api/household/pool-status?period=${PERIOD_KEY}`, {
    headers: { Authorization: `Bearer ${coopToken}` },
  });
  assert(coopPool.status === 403, `run ${run}: non-HOUSEHOLD must get 403 on pool-status`);

  // eslint-disable-next-line no-console
  console.log(`run ${run}: HH-API-1 OK — shares=${data.shares.length} total=${data.total_rial}`);
}

async function main() {
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  if (testServer) {
    await new Promise<void>((resolve, reject) => {
      testServer!.close((err) => (err ? reject(err) : resolve()));
    });
  }
  // eslint-disable-next-line no-console
  console.log("HH-API-1: 3/3 passes");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
