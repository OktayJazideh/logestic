import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../db/prisma";
import { ruleEngine } from "../../services/ruleEngine";
import { isServerUp, loginAs } from "../helpers/http";
import { seedMissionToVerified } from "../helpers/missionFlow";

async function ensureDefaultSplitRules() {
  const admin = await prisma.users.findFirst({ where: { mobile_number: "09000000000" } });
  const uid = admin ? Number(admin.id) : 1;
  const epoch = new Date("2026-01-01T00:00:00.000Z");
  const scope = { type: "GLOBAL" as const };
  await ruleEngine.setActive("split.owner", 0.98, scope, epoch, uid);
  await ruleEngine.setActive("split.platform", 0.02, scope, epoch, uid);
  await ruleEngine.setActive("community.rial_per_verified_ton", 500_000, scope, epoch, uid);
}

describe("weighbridge approve → split", () => {
  let serverUp = false;

  beforeAll(async () => {
    serverUp = await isServerUp();
    if (serverUp) await ensureDefaultSplitRules();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.runIf(() => serverUp)("operational split sums to fare; community from verified tons", async () => {
    const adminToken = await loginAs("09000000000");
    const driverToken = await loginAs("09000000003");
    const coopOpToken = await loginAs("09000000111");
    const coopAdminToken = await loginAs("09000000001");

    const qty = 5.2;
    const periodKey = new Date().toISOString().slice(0, 7);
    const poolBefore = await prisma.community_pools.findUnique({
      where: { mine_id_period_key: { mine_id: BigInt(1), period_key: periodKey } },
    });
    const poolBeforeAmt = poolBefore ? Number(poolBefore.total_amount) : 0;

    const opAdminToken = await loginAs("09000000002");
    const verified = await seedMissionToVerified({
      adminToken,
      driverToken,
      coopOpToken,
      coopAdminToken,
      opAdminToken,
      quantityTons: qty,
    });

    const mission = await prisma.missions.findUnique({ where: { id: BigInt(verified.missionId) } });
    expect(mission?.status).toBe("VERIFIED");
    expect(mission?.payment_state).toBe("DISTRIBUTED");
    expect(verified.totalFare).toBeGreaterThan(0);

    const txs = await prisma.transactions.findMany({
      where: { mission_id: BigInt(verified.missionId) },
    });
    expect(txs.length).toBeGreaterThan(0);

    const ownerWallet = await prisma.wallets.findFirst({
      where: { wallet_type: "OWNER", owner_id: BigInt(verified.ownerId) },
    });
    const platformWallet = await prisma.wallets.findFirst({
      where: { wallet_type: "PLATFORM", platform_owner_key: "DEFAULT" },
    });

    const poolAfter = await prisma.community_pools.findUnique({
      where: { mine_id_period_key: { mine_id: BigInt(verified.mineId), period_key: periodKey } },
    });
    const poolDelta = (poolAfter ? Number(poolAfter.total_amount) : 0) - poolBeforeAmt;

    async function missionWalletBalance(walletId: bigint) {
      const wtxs = txs.filter((t) => t.wallet_id === walletId);
      return wtxs.reduce((b, t) => b + (t.type === "CREDIT" ? Number(t.amount) : -Number(t.amount)), 0);
    }

    const ownerBal = ownerWallet ? await missionWalletBalance(ownerWallet.id) : 0;
    const platformBal = platformWallet ? await missionWalletBalance(platformWallet.id) : 0;
    const operationalSum = ownerBal + platformBal;
    const tolerance = 0.05;
    const expectedCommunity = Math.round(qty * 500_000);

    expect(Math.abs(operationalSum - verified.totalFare)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(verified.ownerAmount + verified.platformAmount - verified.totalFare)).toBeLessThanOrEqual(
      tolerance,
    );
    expect(Math.abs(poolDelta - expectedCommunity)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(verified.communityAmount - expectedCommunity)).toBeLessThanOrEqual(tolerance);
  });
});
