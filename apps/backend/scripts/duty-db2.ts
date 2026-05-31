/**
 * DB-2 duty test: devSeed → driver steps → weighbridge approve → 85+13+2 = 100% fare.
 * Run 3x: npm run test:duty-db2
 * Requires: server on TEST_BASE_URL, db:seed, DATABASE_URL.
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4000";

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

async function runOnce(run: number) {
  const adminToken = await loginAs("09000000000");
  const driverToken = await loginAs("09000000003");
  const coopOpToken = await loginAs("09000000111");
  const coopAdminToken = await loginAs("09000000001");

  const qty = 5 + run * 0.1;
  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: 1, quantity_tons: qty, material_type: "ORE" }),
  });
  if (seed.status !== 200 || !seed.json.success) {
    throw new Error(`devSeed failed run ${run}: ${JSON.stringify(seed.json)}`);
  }

  const missionId = seed.json.data.mission.id as number;
  const ownerId = seed.json.data.entities.fleetOwner.id as number;
  const householdId = seed.json.data.entities.household.id as number;
  const mineId = seed.json.data.mine_id as number;

  const acceptRes = await http(`/api/driver/missions/${missionId}/steps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ step: "ACCEPTED" }),
  });
  if (acceptRes.status !== 200 || !acceptRes.json.success) {
    throw new Error(`driver ACCEPTED failed run ${run}: ${JSON.stringify(acceptRes.json)}`);
  }

  const arrivedRes = await http(`/api/driver/missions/${missionId}/steps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ step: "ARRIVED", latitude: 35.1, longitude: 51.1 }),
  });
  if (arrivedRes.status !== 200 || !arrivedRes.json.success) {
    throw new Error(`driver ARRIVED failed run ${run}: ${JSON.stringify(arrivedRes.json)}`);
  }

  const ticketRes = await http(`/api/driver/missions/${missionId}/ticket`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const ticketId = ticketRes.json?.data?.ticket?.id as number;
  if (!ticketId) throw new Error(`no ticket after ARRIVED run ${run}`);

  const weights = await http(`/api/weighbridge/tickets/${ticketId}/weights`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopOpToken}` },
    body: JSON.stringify({ empty_weight: 10000, loaded_weight: 10000 + qty * 1000 }),
  });
  if (weights.status !== 200 || !weights.json.success) {
    throw new Error(`submit weights failed run ${run}: ${JSON.stringify(weights.json)}`);
  }

  const afterWeights = ["LOADED", "IN_TRANSIT", "DELIVERED"] as const;
  for (const step of afterWeights) {
    const body =
      step === "DELIVERED"
        ? { step, latitude: 35.2, longitude: 51.2 }
        : { step };
    const stepRes = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify(body),
    });
    if (stepRes.status !== 200 || !stepRes.json.success) {
      throw new Error(`driver step ${step} failed run ${run}: ${JSON.stringify(stepRes.json)}`);
    }
  }

  const periodKey = new Date().toISOString().slice(0, 7);
  const poolBefore = await prisma.community_pools.findUnique({
    where: { mine_id_period_key: { mine_id: BigInt(mineId), period_key: periodKey } },
  });
  const poolBeforeAmt = poolBefore ? Number(poolBefore.total_amount) : 0;

  const approve = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${(await loginAs("09000000002"))}` },
  });
  if (approve.status !== 200 || !approve.json.success) {
    throw new Error(`approve failed run ${run}: ${JSON.stringify(approve.json)}`);
  }

  const finance = approve.json.data.finance;
  const totalFare = finance.totalFare as number;
  const ownerAmount = finance.ownerAmount as number;
  const communityAmount = finance.communityAmount as number;
  const platformAmount = finance.platformAmount as number;

  const ownerWallet = await prisma.wallets.findFirst({
    where: { wallet_type: "OWNER", owner_id: BigInt(ownerId) },
  });
  const platformWallet = await prisma.wallets.findFirst({
    where: { wallet_type: "PLATFORM", platform_owner_key: "DEFAULT" },
  });
  const householdWallet = await prisma.wallets.findFirst({
    where: { wallet_type: "HOUSEHOLD", household_id: BigInt(householdId) },
  });

  const poolAfter = await prisma.community_pools.findUnique({
    where: { mine_id_period_key: { mine_id: BigInt(mineId), period_key: periodKey } },
  });
  const poolDelta = (poolAfter ? Number(poolAfter.total_amount) : 0) - poolBeforeAmt;

  async function walletBalance(walletId: bigint) {
    const txs = await prisma.transactions.findMany({ where: { wallet_id: walletId, mission_id: BigInt(missionId) } });
    return txs.reduce((b, t) => b + (t.type === "CREDIT" ? Number(t.amount) : -Number(t.amount)), 0);
  }

  const ownerBal = ownerWallet ? await walletBalance(ownerWallet.id) : 0;
  const platformBal = platformWallet ? await walletBalance(platformWallet.id) : 0;
  const poolAmount = poolDelta;

  const householdBal = householdWallet
    ? (await prisma.transactions.findMany({ where: { wallet_id: householdWallet.id, mission_id: BigInt(missionId) } })).reduce(
        (b, t) => b + (t.type === "CREDIT" ? Number(t.amount) : -Number(t.amount)),
        0,
      )
    : 0;

  if (householdBal !== 0) {
    throw new Error(`run ${run}: household wallet must not get mission 13% directly (got ${householdBal})`);
  }

  const operationalSum = ownerBal + platformBal;
  const tolerance = 0.05;
  if (Math.abs(operationalSum - totalFare) > tolerance) {
    throw new Error(
      `run ${run}: operational sum ${operationalSum} !== totalFare ${totalFare} (owner=${ownerBal}, platform=${platformBal})`,
    );
  }

  if (Math.abs(ownerAmount + platformAmount - totalFare) > tolerance) {
    throw new Error(`run ${run}: operational finance split does not sum to totalFare`);
  }
  if (Math.abs(ownerBal - ownerAmount) > tolerance) {
    throw new Error(`run ${run}: owner tx ${ownerBal} != finance ${ownerAmount}`);
  }
  if (communityAmount <= 0) {
    throw new Error(`run ${run}: community contribution must be positive (got ${communityAmount})`);
  }
  if (Math.abs(poolAmount - communityAmount) > tolerance) {
    throw new Error(`run ${run}: pool delta ${poolAmount} != finance community ${communityAmount}`);
  }
  if (Math.abs(platformBal - platformAmount) > tolerance) {
    throw new Error(`run ${run}: platform tx ${platformBal} != finance ${platformAmount}`);
  }

  const missionRow = await prisma.missions.findUnique({ where: { id: BigInt(missionId) } });
  if (missionRow?.status !== "VERIFIED") {
    throw new Error(`run ${run}: status expected VERIFIED, got ${missionRow?.status}`);
  }
  if (missionRow?.payment_state !== "DISTRIBUTED") {
    throw new Error(`run ${run}: payment_state expected DISTRIBUTED, got ${missionRow?.payment_state}`);
  }

  const auditCount = await prisma.audit_logs.count({
    where: { entity_type: "weighbridge_ticket", entity_id: String(ticketId), action: "APPROVED" },
  });
  if (auditCount < 1) throw new Error(`run ${run}: missing APPROVED audit log`);

  // eslint-disable-next-line no-console
  console.log(
    `Run ${run} OK — mission=${missionId} fare=${totalFare.toFixed(2)} owner=${ownerBal.toFixed(2)} community=${poolAmount.toFixed(2)} platform=${platformBal.toFixed(2)}`,
  );
}

async function main() {
  await initAppContext();
  if (!appContext.mineData.listMines().length) {
    throw new Error("No mines — run npm run db:seed and ensure server can reach DB");
  }

  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  // eslint-disable-next-line no-console
  console.log("DB-2 duty test: 3/3 passed");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
