/**
 * RECEIPT-PDF-1: settlement line receipt PDF — valid %PDF- header + 401 wrong owner.
 * Run 3x: npm run test:receipt-pdf1
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { prisma } from "../src/db/prisma";
import { toBig, toNum } from "../src/repositories/id";
import { buildSettlementReceiptPdf, resolveReceiptFontPathForTests } from "../src/lib/simplePdf";
import { receiptPdfPublicUrl, receiptVerifyUrl } from "../src/services/receiptPdfService";
import * as walletsRepo from "../src/repositories/walletsRepository";

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
      process.env.PUBLIC_URL = baseUrl;
      resolve(baseUrl);
    });
    testServer.on("error", reject);
  });
}

async function loginAs(mobile: string) {
  const root = await ensureTestServer();
  await fetch(`${root}/api/auth/request-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mobile_number: mobile }),
  });
  const devOtp = await fetch(`${root}/api/auth/__dev/otp?mobile_number=${mobile}`);
  const devJson = await devOtp.json();
  const code = devJson?.data?.otp;
  if (!code) throw new Error(`dev otp missing for ${mobile}`);
  const verify = await fetch(`${root}/api/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mobile_number: mobile, otp_code: code }),
  });
  const verifyJson = await verify.json();
  if (verify.status !== 200 || !verifyJson.success) {
    throw new Error(`verify failed for ${mobile}: ${JSON.stringify(verifyJson)}`);
  }
  return verifyJson.data.access_token as string;
}

async function fetchPdf(path: string, token?: string) {
  const root = await ensureTestServer();
  const res = await fetch(`${root}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, contentType: res.headers.get("content-type") };
}

async function seedSettledOwnerLine(run: number) {
  await appContext.entities.hydrate();
  const ownerUser = await appContext.userStore.upsertUserByMobile(`0916000${String(run).padStart(4, "0")}`, "FLEET_OWNER", {
    is_active: true,
  });
  const owner = await prisma.fleet_owners.upsert({
    where: { user_id: toBig(ownerUser.id) },
    create: {
      user_id: toBig(ownerUser.id),
      full_name: `مالک رسید ${run}`,
      national_id: `RP${String(run).padStart(10, "0")}`,
      bank_iban: "IR820540102680020817909002",
      status: "APPROVED",
    },
    update: {
      full_name: `مالک رسید ${run}`,
      bank_iban: "IR820540102680020817909002",
      status: "APPROVED",
    },
  });

  const walletExisting = await walletsRepo.findWalletForOwner(toNum(owner.id));
  const wallet =
    walletExisting ??
    (await (async () => {
      const w = await prisma.wallets.create({
        data: { wallet_type: "OWNER", owner_id: owner.id },
      });
      return { id: toNum(w.id), wallet_type: "OWNER" as const, owner_id: toNum(owner.id) };
    })());
  const paymentRef = `RCPT-REF-${run}-${Date.now()}`;
  const paidAt = new Date("2099-06-15T10:30:00.000Z");

  const batch = await prisma.settlement_batches.create({
    data: {
      period_start: new Date("2099-06-01"),
      period_end: new Date("2099-06-30"),
      status: "SETTLED",
      payment_reference: paymentRef,
      paid_at: paidAt,
    },
  });

  const line = await prisma.settlement_lines.create({
    data: {
      batch_id: batch.id,
      wallet_id: wallet.id,
      amount: 1_250_000 + run * 1000,
    },
  });

  await prisma.payment_payouts.create({
    data: {
      settlement_batch_id: batch.id,
      settlement_line_id: line.id,
      status: "COMPLETED",
      completed_at: paidAt,
      bank_reference: paymentRef,
    },
  });

  return {
    ownerMobile: ownerUser.mobile_number,
    lineId: toNum(line.id),
    batchId: toNum(batch.id),
    paymentRef,
    walletId: wallet.id,
  };
}

async function cleanupLine(lineId: number, batchId: number, walletId: number) {
  await prisma.payment_payouts.deleteMany({ where: { settlement_line_id: toBig(lineId) } });
  await prisma.settlement_lines.delete({ where: { id: toBig(lineId) } });
  await prisma.settlement_batches.delete({ where: { id: toBig(batchId) } });
  await prisma.wallets.delete({ where: { id: toBig(walletId) } }).catch(() => undefined);
}

async function testUnitPdfBuffer(run: number) {
  const ref = `UNIT-${run}`;
  const buf = await buildSettlementReceiptPdf({
    platformName: "Logestic",
    payeeName: `Payee ${run}`,
    ibanMasked: "IR82 ******** 9002",
    amountRialFa: `${(1_000_000 + run).toLocaleString("fa-IR")} ریال`,
    amountTomanFa: `${Math.round((1_000_000 + run) / 10).toLocaleString("fa-IR")} تومان`,
    paymentReference: ref,
    paidAtFa: new Date().toLocaleString("fa-IR"),
    verifyUrl: receiptVerifyUrl(ref),
  });
  assert(buf.subarray(0, 5).toString("utf8") === "%PDF-", `run ${run}: unit PDF must start with %PDF-`);
  assert(buf.length > 500, `run ${run}: PDF too small`);
}

async function runOnce(run: number) {
  assert(resolveReceiptFontPathForTests() != null, `run ${run}: Persian font file missing`);

  await testUnitPdfBuffer(run);

  const { ownerMobile, lineId, batchId, paymentRef, walletId } = await seedSettledOwnerLine(run);
  const ownerToken = await loginAs(ownerMobile);
  const adminToken = await loginAs("09000000000");
  const wrongToken = await loginAs("09000001001");

  const ownerPdf = await fetchPdf(`/api/settlement/lines/${lineId}/receipt.pdf`, ownerToken);
  assert(ownerPdf.status === 200, `run ${run}: owner PDF status ${ownerPdf.status}`);
  assert(ownerPdf.contentType?.includes("application/pdf"), `run ${run}: owner content-type`);
  assert(ownerPdf.buf.subarray(0, 5).toString("utf8") === "%PDF-", `run ${run}: owner PDF header`);

  const adminPdf = await fetchPdf(`/api/settlement/lines/${lineId}/receipt.pdf`, adminToken);
  assert(adminPdf.status === 200, `run ${run}: admin PDF status ${adminPdf.status}`);
  assert(adminPdf.buf.subarray(0, 5).toString("utf8") === "%PDF-", `run ${run}: admin PDF header`);

  const wrongOwner = await fetchPdf(`/api/settlement/lines/${lineId}/receipt.pdf`, wrongToken);
  assert(wrongOwner.status === 401, `run ${run}: wrong owner must be 401, got ${wrongOwner.status}`);

  const lineRow = await prisma.settlement_lines.findUnique({ where: { id: toBig(lineId) } });
  assert(lineRow?.receipt_file_url === receiptPdfPublicUrl(lineId), `run ${run}: receipt_file_url not persisted`);
  assert(lineRow?.receipt_file_url?.includes(`/lines/${lineId}/receipt.pdf`), `run ${run}: bad receipt URL`);
  assert(receiptVerifyUrl(paymentRef).includes(`/verify/receipt/${encodeURIComponent(paymentRef)}`), `run ${run}: verify URL`);

  await cleanupLine(lineId, batchId, walletId);
  console.log(`RECEIPT-PDF-1 run ${run}: PASS`);
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  console.log("RECEIPT-PDF-1: all 3 runs PASS");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (testServer) {
      await new Promise<void>((resolve, reject) => testServer!.close((err) => (err ? reject(err) : resolve())));
    }
    await prisma.$disconnect();
  });
