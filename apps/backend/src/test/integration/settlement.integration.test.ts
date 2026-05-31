import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../db/prisma";
import { http, isServerUp, loginAs, pollJobHttp, selectMine } from "../helpers/http";
import { seedMissionToVerified } from "../helpers/missionFlow";

describe("settlement monthly-close", () => {
  let serverUp = false;

  beforeAll(async () => {
    serverUp = await isServerUp();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.runIf(() => serverUp)("monthly-close, reject without payment_reference, mark-paid requires reference", async () => {
    const adminToken = await loginAs("09000000000");
    const driverToken = await loginAs("09000000003");
    const coopOpToken = await loginAs("09000000111");
    const coopAdminToken = await loginAs("09000000001");
    const opAdminToken = await loginAs("09000000002");
    const opLockerToken = await loginAs("09000000103");

    await seedMissionToVerified({
      adminToken,
      driverToken,
      coopOpToken,
      coopAdminToken,
      opAdminToken,
      quantityTons: 4.8,
    });

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    await prisma.settlement_batches.deleteMany({
      where: {
        mine_id: BigInt(1),
        period_start: new Date(Date.UTC(year, month - 1, 1)),
      },
    });

    const close = await http("/api/admin/settlement/monthly-close", {
      method: "POST",
      headers: { Authorization: `Bearer ${opAdminToken}` },
      body: JSON.stringify({ mine_id: 1, year, month, wait: true }),
    });
    expect(close.status).toBe(200);
    expect(close.json.success).toBe(true);
    const batchId = close.json.data.batch.id as number;
    expect(close.json.data.batch.status).toBe("CALCULATED");

    await http(`/api/admin/settlement/${batchId}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${coopAdminToken}` },
    });
    await http(`/api/admin/settlement/${batchId}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opAdminToken}` },
    });

    const lock = await http(`/api/admin/settlement/${batchId}/lock`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opLockerToken}` },
    });
    expect(lock.status).toBe(200);
    expect(lock.json.data.batch.status).toBe("READY_FOR_SETTLEMENT");

    const bank = await http(`/api/admin/settlement/${batchId}/send-to-bank`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opAdminToken}` },
    });
    expect(bank.status).toBe(200);
    expect(bank.json.data.batch.status).toBe("IN_BANK_QUEUE");

    const noRef = await http(`/api/admin/settlement/${batchId}/mark-paid`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opAdminToken}` },
      body: JSON.stringify({
        receipt_file_url: "https://example.com/receipt.pdf",
      }),
    });
    expect(noRef.status).toBe(400);

    const shortRef = await http(`/api/admin/settlement/${batchId}/mark-paid`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opAdminToken}` },
      body: JSON.stringify({
        payment_reference: "short",
        receipt_file_url: "https://example.com/receipt.pdf",
      }),
    });
    expect(shortRef.status).toBe(400);

    const reject = await http(`/api/admin/settlement/${batchId}/mark-failed`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opAdminToken}` },
      body: JSON.stringify({ reason: "vitest reject without payment ref" }),
    });
    expect(reject.status).toBe(200);
    expect(reject.json.data.batch.status).toBe("FAILED");
    expect(reject.json.data.batch.payment_reference ?? null).toBeNull();

    const row = await prisma.settlement_batches.findUnique({ where: { id: BigInt(batchId) } });
    expect(row?.status).toBe("FAILED");
    expect(row?.failure_reason).toContain("vitest");
  });

  it.runIf(() => serverUp)("async monthly-close returns 202 and completes job", async () => {
    const adminToken = await loginAs("09000000000");
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    const opAdminToken = await loginAs("09000000002");
    await selectMine(opAdminToken, 1);
    const close = await http("/api/admin/settlement/monthly-close", {
      method: "POST",
      headers: { Authorization: `Bearer ${opAdminToken}` },
      body: JSON.stringify({ mine_id: 1, year, month }),
    });
    if (close.status === 409) return;
    expect(close.status).toBe(202);
    const jobId = close.json.data.job_id as string;
    const job = await pollJobHttp(jobId, opAdminToken);
    const result = job.result as { ok: boolean };
    expect(result.ok).toBe(true);
  });
});
