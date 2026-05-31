import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../db/prisma";
import { http, isServerUp, loginAs } from "../helpers/http";
import { seedMissionToVerified } from "../helpers/missionFlow";

describe("weighbridge adjustment delta on wallet", () => {
  let serverUp = false;

  beforeAll(async () => {
    serverUp = await isServerUp();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.runIf(() => serverUp)("approve adjustment applies signed fare delta to owner wallet", async () => {
    const adminToken = await loginAs("09000000000");
    const driverToken = await loginAs("09000000003");
    const coopOpToken = await loginAs("09000000111");
    const coopAdminToken = await loginAs("09000000001");
    const opAdminToken = await loginAs("09000000002");

    const verified = await seedMissionToVerified({
      adminToken,
      driverToken,
      coopOpToken,
      coopAdminToken,
      opAdminToken,
      quantityTons: 5,
    });

    const ticket = await prisma.weighbridge_tickets.findUnique({
      where: { id: BigInt(verified.ticketId) },
    });
    const beforeNet = Number(ticket?.net_weight ?? 0);
    const afterNet = beforeNet * 1.1;

    const ownerWallet = await prisma.wallets.findFirst({
      where: { wallet_type: "OWNER", owner_id: BigInt(verified.ownerId) },
    });
    expect(ownerWallet).toBeTruthy();

    async function ownerMissionBalance() {
      const txs = await prisma.transactions.findMany({
        where: { wallet_id: ownerWallet!.id, mission_id: BigInt(verified.missionId) },
      });
      return txs.reduce((b, t) => b + (t.type === "CREDIT" ? Number(t.amount) : -Number(t.amount)), 0);
    }

    const balanceBefore = await ownerMissionBalance();

    const createAdj = await http("/api/weighbridge/adjustments", {
      method: "POST",
      headers: { Authorization: `Bearer ${opAdminToken}` },
      body: JSON.stringify({
        ticket_id: verified.ticketId,
        reason: "vitest adjustment delta",
        after_net: afterNet,
      }),
    });
    expect(createAdj.status).toBe(200);
    const adjustmentId = createAdj.json.data.adjustment.id as number;

    const approveAdj = await http(`/api/weighbridge/adjustments/${adjustmentId}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opAdminToken}` },
    });
    expect(approveAdj.status).toBe(200);
    const delta = approveAdj.json.data.delta_total_fare as number;
    expect(delta).not.toBe(0);

    const balanceAfter = await ownerMissionBalance();
    expect(Math.abs(balanceAfter - balanceBefore)).toBeGreaterThan(0);
    if (delta > 0) expect(balanceAfter).toBeGreaterThan(balanceBefore);
    else expect(balanceAfter).toBeLessThan(balanceBefore);
  });
});
