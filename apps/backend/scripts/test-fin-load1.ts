/**
 * WF-FIN-LOAD-1: admin finance by-load table — per-mission operational + community (ton-based).
 * Run 3x: npm run test:fin-load1
 * Requires: DATABASE_URL, db:migrate, db:seed.
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { prisma } from "../src/db/prisma";
import { fromDecimal } from "../src/repositories/decimal";
import * as rateCardsRepo from "../src/repositories/rateCardsRepository";

let testServer: Server | null = null;
let baseUrl = "";

const TONS = 30;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
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

async function selectWorkspace(token: string, mineId: number) {
  const r = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: mineId }),
  });
  if (r.status !== 200 || !r.json.success) {
    throw new Error(`workspace select failed: ${JSON.stringify(r.json)}`);
  }
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

async function verifyMission(params: {
  run: number;
  mineId: number;
  quantityTons: number;
  adminToken: string;
}): Promise<number> {
  const driverToken = await loginAs("09000000003");
  const coopOpToken = await loginAs("09000000111");
  await selectWorkspace(driverToken, params.mineId);
  await selectWorkspace(coopOpToken, params.mineId);

  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${params.adminToken}` },
    body: JSON.stringify({
      mine_id: params.mineId,
      quantity_tons: params.quantityTons,
      material_type: "ORE",
    }),
  });
  assert(seed.status === 200 && seed.json.success, `run ${params.run}: seed failed ${JSON.stringify(seed.json)}`);
  const missionId = seed.json.data.mission.id as number;

  for (const step of ["ACCEPTED", "ARRIVED"] as const) {
    const body =
      step === "ARRIVED" ? { step, latitude: 27.0, longitude: 55.0 } : { step };
    const r = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify(body),
    });
    assert(r.status === 200, `run ${params.run}: step ${step} failed: ${JSON.stringify(r.json)}`);
  }

  const ticketRes = await http(`/api/driver/missions/${missionId}/ticket`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const ticketId = ticketRes.json?.data?.ticket?.id as number;
  assert(ticketId != null, `run ${params.run}: no weighbridge ticket`);

  const loaded = 10000 + params.quantityTons * 1000;
  const weights = await http(`/api/weighbridge/tickets/${ticketId}/weights`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopOpToken}` },
    body: JSON.stringify({ empty_weight: 10000, loaded_weight: loaded }),
  });
  assert(weights.status === 200, `run ${params.run}: weights failed`);

  for (const step of ["LOADED", "IN_TRANSIT", "DELIVERED"] as const) {
    const body = step === "DELIVERED" ? { step, latitude: 27.05, longitude: 55.05 } : { step };
    const r = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify(body),
    });
    assert(r.status === 200, `run ${params.run}: step ${step} failed: ${JSON.stringify(r.json)}`);
  }

  const opAdminToken = await loginAs("09000000002");
  await selectWorkspace(opAdminToken, params.mineId);
  const approve = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
  });
  assert(approve.status === 200 && approve.json.success, `run ${params.run}: approve failed`);

  const mission = await prisma.missions.findUnique({
    where: { id: BigInt(missionId) },
    select: { verified_at: true, community_contribution_rial: true },
  });
  assert(mission?.verified_at != null, `run ${params.run}: verified_at missing`);
  assert(
    mission.community_contribution_rial != null && Number(mission.community_contribution_rial) > 0,
    `run ${params.run}: community_contribution_rial must be set`,
  );

  return missionId;
}

async function bumpOreRate(mineId: number, newRate: number, adminUserId: number) {
  const now = new Date();
  const draft = await rateCardsRepo.createDraftRateCard({
    mine_id: mineId,
    operation_type: "TONNAGE",
    material_type: "ORE",
    unit_type: "TON",
    rate: newRate,
    effective_from: now,
    created_by: adminUserId,
  });
  await rateCardsRepo.activateRateCard(draft.id, adminUserId);
}

type ByLoadItem = {
  mission_id: number;
  plate: string;
  verified_net_tons: number;
  operational_fare_rial: number;
  owner_amount_rial: number;
  platform_fee_rial: number;
  community_contribution_rial: number;
  community_rate_per_ton_rial: number;
  payment_hold: boolean;
  hold_amount_rial: number;
  verified_at: string;
};

async function fetchByLoad(adminToken: string, mineId: number, from: string, to: string) {
  const res = await http(
    `/api/admin/finance/by-load?mine_id=${mineId}&from=${from}&to=${to}&status=VERIFIED`,
    { headers: { Authorization: `Bearer ${adminToken}` } },
  );
  assert(res.status === 200 && res.json?.success, `by-load failed: ${JSON.stringify(res.json)}`);
  return res.json.data as {
    items: ByLoadItem[];
    totals: { operational_fare_rial: number; community_contribution_rial: number; note: string };
  };
}

async function ledgerTotals(from: Date, to: Date, mineId: number) {
  const missions = await prisma.missions.findMany({
    where: {
      status: "VERIFIED",
      verified_at: { gte: from, lt: to },
      load: { mine_id: BigInt(mineId) },
    },
    include: {
      transactions: { include: { wallet: { select: { wallet_type: true } } } },
    },
  });
  let operational = 0;
  let community = 0;
  for (const m of missions) {
    community += m.community_contribution_rial != null ? fromDecimal(m.community_contribution_rial) : 0;
    for (const t of m.transactions) {
      const amt = fromDecimal(t.amount);
      const delta = t.type === "CREDIT" ? amt : -amt;
      if (t.wallet.wallet_type === "OWNER" || t.wallet.wallet_type === "PLATFORM") {
        operational += delta;
      }
    }
  }
  return { operational: round2(operational), community: round2(community) };
}

async function runOnce(run: number) {
  const adminToken = await loginAs("09000000000");
  const adminUser = await prisma.users.findFirst({ where: { mobile_number: "09000000000" } });
  assert(adminUser != null, `run ${run}: admin user missing`);

  const missionId1 = await verifyMission({
    run,
    mineId: 1,
    quantityTons: TONS,
    adminToken,
  });

  await bumpOreRate(1, 18000, Number(adminUser.id));

  const missionId2 = await verifyMission({
    run,
    mineId: 1,
    quantityTons: TONS,
    adminToken,
  });

  const from = daysAgoIso(1);
  const to = todayIso();
  const data = await fetchByLoad(adminToken, 1, from, to);

  const row1 = data.items.find((i) => i.mission_id === missionId1);
  const row2 = data.items.find((i) => i.mission_id === missionId2);
  assert(row1 != null, `run ${run}: mission 1 not in by-load items`);
  assert(row2 != null, `run ${run}: mission 2 not in by-load items`);

  assert(row1.verified_net_tons === TONS, `run ${run}: mission 1 tons expected ${TONS}`);
  assert(row2.verified_net_tons === TONS, `run ${run}: mission 2 tons expected ${TONS}`);
  assert(
    row1.operational_fare_rial !== row2.operational_fare_rial,
    `run ${run}: operational fares must differ (different rate cards)`,
  );
  assert(
    row1.community_contribution_rial === row2.community_contribution_rial,
    `run ${run}: community must be equal for same tons (${row1.community_contribution_rial} vs ${row2.community_contribution_rial})`,
  );
  assert(
    row1.community_contribution_rial !== round2(row1.operational_fare_rial * 0.13),
    `run ${run}: community must not be fare * 0.13`,
  );
  assert(row1.plate.length > 0, `run ${run}: plate required`);
  assert(data.totals.note === "community independent of fare", `run ${run}: totals note`);

  const sumOperational = round2(data.items.reduce((s, i) => s + i.operational_fare_rial, 0));
  const sumCommunity = round2(data.items.reduce((s, i) => s + i.community_contribution_rial, 0));
  assert(data.totals.operational_fare_rial === sumOperational, `run ${run}: totals operational mismatch`);
  assert(data.totals.community_contribution_rial === sumCommunity, `run ${run}: totals community mismatch`);

  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toExclusive = new Date(`${to}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  const ledger = await ledgerTotals(fromDate, toExclusive, 1);
  assert(
    data.totals.community_contribution_rial === ledger.community,
    `run ${run}: API community total must match ledger (${data.totals.community_contribution_rial} vs ${ledger.community})`,
  );
  assert(
    data.totals.operational_fare_rial === ledger.operational,
    `run ${run}: API operational total must match ledger (${data.totals.operational_fare_rial} vs ${ledger.operational})`,
  );

  const mine2Data = await fetchByLoad(adminToken, 2, from, to);
  const mine2HasMine1 = mine2Data.items.some((i) => i.mission_id === missionId1 || i.mission_id === missionId2);
  assert(!mine2HasMine1, `run ${run}: mine 1 missions must not appear in mine_id=2 query`);

  if (run === 3) {
    const opAdminToken = await loginAs("09000000002");
    await selectWorkspace(opAdminToken, 1);
    const hold = await http(`/api/weighbridge/missions/${missionId2}/payment/hold`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opAdminToken}` },
      body: JSON.stringify({ reason: "test hold WF-FIN-LOAD-1" }),
    });
    assert(hold.status === 200 && hold.json.success, `run ${run}: hold failed ${JSON.stringify(hold.json)}`);

    const afterHold = await fetchByLoad(adminToken, 1, from, to);
    const heldRow = afterHold.items.find((i) => i.mission_id === missionId2);
    assert(heldRow?.payment_hold === true, `run ${run}: payment_hold expected true`);
    const expectedHold = round2(heldRow!.operational_fare_rial * 0.05);
    assert(heldRow!.hold_amount_rial === expectedHold, `run ${run}: hold_amount_rial expected ${expectedHold}`);
  }

  // eslint-disable-next-line no-console
  console.log(`WF-FIN-LOAD-1 run ${run} OK`, {
    mission1: { fare: row1.operational_fare_rial, community: row1.community_contribution_rial },
    mission2: { fare: row2.operational_fare_rial, community: row2.community_contribution_rial },
    items: data.items.length,
  });
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  // eslint-disable-next-line no-console
  console.log("WF-FIN-LOAD-1: 3/3 runs passed");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (testServer) {
      await new Promise<void>((resolve) => testServer!.close(() => resolve()));
    }
    await prisma.$disconnect();
  });
