/**
 * ACC-FUND-1: fund_type + ledger_lane on transactions after VERIFIED split.
 * Run: npm run test:acc-fund1
 * Requires: DATABASE_URL, db:migrate, db:seed.
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { prisma } from "../src/db/prisma";
import { sumByFundType } from "../src/services/adminFinanceService";
import { fromDecimal } from "../src/repositories/decimal";
import * as walletsRepo from "../src/repositories/walletsRepository";
import { FundType, LedgerLane } from "../src/types/fundAccounting";

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

async function verifyMissionViaWeighbridge(run: number): Promise<number> {
  const qty = 8 + run * 0.1;
  const adminToken = await loginAs("09000000000");
  const driverToken = await loginAs("09000000003");
  const coopOpToken = await loginAs("09000000111");
  const coopAdminToken = await loginAs("09000000001");
  const opAdminToken = await loginAs("09000000002");
  await selectWorkspace(driverToken, 1);
  await selectWorkspace(coopOpToken, 1);
  await selectWorkspace(coopAdminToken, 1);

  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: 1, quantity_tons: qty, material_type: "ORE" }),
  });
  if (seed.status !== 200 || !seed.json.success) {
    throw new Error(`run ${run}: seed failed ${JSON.stringify(seed.json)}`);
  }
  const missionId = seed.json.data.mission.id as number;
  assert(seed.json.data.mission.status === "ASSIGNED", `run ${run}: demo mission must be ASSIGNED`);

  for (const step of ["ACCEPTED", "ARRIVED"] as const) {
    const body =
      step === "ARRIVED" ? { step, latitude: 27.0, longitude: 55.0 } : { step };
    const r = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify(body),
    });
    if (r.status !== 200) {
      throw new Error(`run ${run}: step ${step} failed: ${JSON.stringify(r.json)}`);
    }
  }

  const ticketRes = await http(`/api/driver/missions/${missionId}/ticket`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const ticketId = ticketRes.json?.data?.ticket?.id as number;
  if (!ticketId) throw new Error(`run ${run}: no ticket`);

  const weights = await http(`/api/weighbridge/tickets/${ticketId}/weights`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopOpToken}` },
    body: JSON.stringify({ empty_weight: 10000, loaded_weight: 10000 + qty * 1000 }),
  });
  if (weights.status !== 200) throw new Error(`run ${run}: weights failed`);

  for (const step of ["LOADED", "IN_TRANSIT", "DELIVERED"] as const) {
    const body = step === "DELIVERED" ? { step, latitude: 27.05, longitude: 55.05 } : { step };
    const r = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify(body),
    });
    if (r.status !== 200) {
      throw new Error(`run ${run}: step ${step} failed: ${JSON.stringify(r.json)}`);
    }
  }

  const approve = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
  });
  if (approve.status !== 200 || !approve.json.success) {
    throw new Error(`run ${run}: approve failed ${JSON.stringify(approve.json)}`);
  }

  const mission = await prisma.missions.findUnique({ where: { id: BigInt(missionId) } });
  if (mission?.status !== "VERIFIED") {
    throw new Error(`run ${run}: expected VERIFIED, got ${mission?.status}`);
  }

  return missionId;
}

async function assertMissionFundTags(missionId: number, run: number) {
  const txs = await prisma.transactions.findMany({
    where: { mission_id: BigInt(missionId) },
    include: { wallet: true },
  });
  assert(txs.length >= 2, `run ${run}: expected owner + platform txs for mission ${missionId}`);

  for (const t of txs) {
    assert(t.fund_type != null, `run ${run}: tx ${t.id} missing fund_type`);
    assert(t.ledger_lane != null, `run ${run}: tx ${t.id} missing ledger_lane`);
  }

  const ownerTx = txs.find((t) => t.wallet.wallet_type === "OWNER");
  const platformTx = txs.find((t) => t.wallet.wallet_type === "PLATFORM");
  assert(ownerTx != null, `run ${run}: missing owner tx`);
  assert(platformTx != null, `run ${run}: missing platform tx`);
  assert(ownerTx.fund_type === FundType.OPERATIONAL, `run ${run}: owner fund_type`);
  assert(ownerTx.ledger_lane === LedgerLane.OPERATIONAL_LEDGER, `run ${run}: owner ledger_lane`);
  assert(platformTx.fund_type === FundType.PLATFORM_REVENUE, `run ${run}: platform fund_type`);
  assert(platformTx.ledger_lane === LedgerLane.PLATFORM_LEDGER, `run ${run}: platform ledger_lane`);

  // eslint-disable-next-line no-console
  console.log(`run ${run} mission ${missionId}: ${txs.length} txs tagged OK`);
}

async function sumMissionByFund(missionId: number, fundType: FundType): Promise<number> {
  const rows = await prisma.transactions.findMany({
    where: { mission_id: BigInt(missionId), fund_type: fundType },
  });
  return rows.reduce((s, t) => s + walletsRepo.transactionBalanceDelta(t.type, fromDecimal(t.amount)), 0);
}

async function assertAdminFinanceFundFilter(missionId: number, run: number) {
  const mission = await prisma.missions.findUnique({
    where: { id: BigInt(missionId) },
    select: { verified_at: true },
  });
  assert(mission?.verified_at != null, `run ${run}: verified_at required`);

  const operational = await sumMissionByFund(missionId, FundType.OPERATIONAL);
  const platform = await sumMissionByFund(missionId, FundType.PLATFORM_REVENUE);
  const community = await sumMissionByFund(missionId, FundType.COMMUNITY_RESTRICTED);

  const ownerAmt = await prisma.transactions.findFirst({
    where: { mission_id: BigInt(missionId), wallet: { wallet_type: "OWNER" } },
    select: { amount: true, type: true },
  });
  const platformAmt = await prisma.transactions.findFirst({
    where: { mission_id: BigInt(missionId), wallet: { wallet_type: "PLATFORM" } },
    select: { amount: true, type: true },
  });
  assert(ownerAmt != null && platformAmt != null, `run ${run}: mission txs missing`);

  const ownerVal = walletsRepo.transactionBalanceDelta(ownerAmt.type, fromDecimal(ownerAmt.amount));
  const platformVal = walletsRepo.transactionBalanceDelta(platformAmt.type, fromDecimal(platformAmt.amount));
  assert(Math.abs(operational - ownerVal) < 0.02, `run ${run}: operational filter ${operational} vs ${ownerVal}`);
  assert(Math.abs(platform - platformVal) < 0.02, `run ${run}: platform filter ${platform} vs ${platformVal}`);
  assert(community === 0, `run ${run}: mission split must not tag community wallet txs`);

  const verifiedAt = mission.verified_at!;
  const periodStart = new Date(verifiedAt.getTime() - 1000);
  const periodEnd = new Date(verifiedAt.getTime() + 1000);
  const periodOperational = await sumByFundType(FundType.OPERATIONAL, periodStart, periodEnd, 1);
  assert(periodOperational >= operational - 0.02, `run ${run}: sumByFundType period must include mission operational`);

  // eslint-disable-next-line no-console
  console.log(`run ${run} AdminFinance fund filter OK — operational=${operational} platform=${platform}`);
}

async function runOnce(run: number) {
  const missionId = await verifyMissionViaWeighbridge(run);
  await assertMissionFundTags(missionId, run);
  await assertAdminFinanceFundFilter(missionId, run);
}

async function main() {
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  // eslint-disable-next-line no-console
  console.log("ACC-FUND-1: 3/3 runs passed");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (testServer) {
      await new Promise<void>((resolve, reject) => {
        testServer!.close((err) => (err ? reject(err) : resolve()));
      });
    }
    await prisma.$disconnect();
  });
