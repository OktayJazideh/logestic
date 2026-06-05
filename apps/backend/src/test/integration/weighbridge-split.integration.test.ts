import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../db/prisma";
import { loadMineFinanceConfig } from "../../services/mineSettingsService";
import { ruleEngine } from "../../services/ruleEngine";
import { isServerUp, loginAs } from "../helpers/http";
import { seedMissionToVerified } from "../helpers/missionFlow";

describe("weighbridge approve → split", () => {
  let serverUp = false;

  beforeAll(async () => {
    serverUp = await isServerUp();
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
    const periodKey = await ruleEngine.getPeriodKey(new Date(), { mineId: 1 });
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
    const financeCfg = await loadMineFinanceConfig(verified.mineId, { cooperative_id: 1 });
    const expectedCommunity = Math.round(qty * financeCfg.community_rial_per_ton);

    expect(Math.abs(operationalSum - verified.totalFare)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(verified.ownerAmount + verified.platformAmount - verified.totalFare)).toBeLessThanOrEqual(
      tolerance,
    );
    expect(Math.abs(verified.communityAmount - expectedCommunity)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(poolDelta - verified.communityAmount)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(Number(mission?.community_contribution_rial ?? 0) - expectedCommunity)).toBeLessThanOrEqual(
      tolerance,
    );
  });
});
