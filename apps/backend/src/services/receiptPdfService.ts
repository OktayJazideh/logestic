import type { AuthContext } from "../middleware/authMiddleware";
import { ApiError } from "../http/errors";
import { env } from "../config/env";
import { maskIban } from "../lib/iban";
import { formatRialFa, formatTomanFa } from "../lib/formatMoneyBackend";
import { buildSettlementReceiptPdf } from "../lib/simplePdf";
import { normalizeRole } from "../types/userRole";
import { fromDecimal } from "../repositories/decimal";
import { toNum } from "../repositories/id";
import * as settlementRepo from "../repositories/settlementRepository";

/**
 * Cache policy (RECEIPT-PDF-1):
 * - PDF bytes are regenerated on every GET (no stale content if batch metadata changes).
 * - `settlement_lines.receipt_file_url` stores the stable public URL after first successful generate.
 */
export function receiptPdfPublicUrl(lineId: number): string {
  const base = env.PUBLIC_URL.replace(/\/$/, "");
  return `${base}/api/settlement/lines/${lineId}/receipt.pdf`;
}

export function receiptVerifyUrl(paymentReference: string): string {
  const base = env.PUBLIC_URL.replace(/\/$/, "");
  return `${base}/verify/receipt/${encodeURIComponent(paymentReference)}`;
}

function formatPaidAtFa(d: Date): string {
  return d.toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" });
}

function walletOwnerUserId(line: NonNullable<Awaited<ReturnType<typeof settlementRepo.getLineForReceipt>>>): number | null {
  const w = line.wallet;
  if (w.wallet_type === "OWNER" && w.owner?.user_id != null) return toNum(w.owner.user_id);
  if (w.wallet_type === "HOUSEHOLD" && w.household?.user_id != null) return toNum(w.household.user_id);
  return null;
}

export function assertReceiptLineAccess(
  auth: AuthContext,
  line: NonNullable<Awaited<ReturnType<typeof settlementRepo.getLineForReceipt>>>,
  requestId?: string,
): void {
  if (normalizeRole(auth.user.role) === "ADMIN") return;
  const ownerUserId = walletOwnerUserId(line);
  if (ownerUserId == null || ownerUserId !== auth.user.id) {
    throw new ApiError({
      statusCode: 401,
      code: "receipt_forbidden",
      message: "Not authorized for this settlement line receipt",
      requestId,
    });
  }
}

export async function generateSettlementLineReceiptPdf(
  lineId: number,
  opts?: { persistUrl?: boolean },
): Promise<{ buffer: Buffer; receipt_file_url: string }> {
  const line = await settlementRepo.getLineForReceipt(lineId);
  if (!line) {
    throw new ApiError({ statusCode: 404, code: "line_not_found", message: "Settlement line not found" });
  }
  if (line.batch.status !== "SETTLED") {
    throw new ApiError({
      statusCode: 409,
      code: "batch_not_settled",
      message: "Receipt is available only after settlement is paid",
    });
  }
  const paymentReference = line.batch.payment_reference ?? line.payment_payout?.bank_reference;
  if (!paymentReference) {
    throw new ApiError({
      statusCode: 409,
      code: "payment_reference_missing",
      message: "Payment reference not available for this line",
    });
  }
  const paidAt = line.batch.paid_at ?? line.payment_payout?.completed_at;
  if (!paidAt) {
    throw new ApiError({
      statusCode: 409,
      code: "paid_at_missing",
      message: "Paid timestamp not available for this line",
    });
  }

  const w = line.wallet;
  let payeeName = "—";
  let ibanRaw: string | null = null;
  if (w.wallet_type === "OWNER" && w.owner) {
    payeeName = w.owner.full_name;
    ibanRaw = w.owner.bank_iban;
  } else if (w.wallet_type === "HOUSEHOLD" && w.household) {
    payeeName = w.household.head_name;
    ibanRaw = w.household.bank_iban;
  }

  const amountRial = fromDecimal(line.amount);
  const buffer = await buildSettlementReceiptPdf({
    platformName: env.PLATFORM_NAME,
    payeeName,
    ibanMasked: maskIban(ibanRaw),
    amountRialFa: formatRialFa(amountRial),
    amountTomanFa: formatTomanFa(amountRial),
    paymentReference,
    paidAtFa: formatPaidAtFa(paidAt),
    verifyUrl: receiptVerifyUrl(paymentReference),
  });

  const receipt_file_url = receiptPdfPublicUrl(lineId);
  if (opts?.persistUrl !== false) {
    await settlementRepo.updateLineReceiptUrl(lineId, receipt_file_url);
  }

  return { buffer, receipt_file_url };
}
