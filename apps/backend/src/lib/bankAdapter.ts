/** BANK-AUTO-1 — bank payout adapter (Mock default; ZarinPal/Saman later). */

export type PayoutLineInput = {
  iban: string;
  amount_rial: number;
  reference: string;
  payee_name: string;
};

export type PayoutInitResult = {
  bank_ref: string;
  status: "ACCEPTED" | "REJECTED";
};

export interface BankAdapter {
  initiatePayout(line: PayoutLineInput): Promise<PayoutInitResult>;
}

function mockBankFailEnabled(): boolean {
  const v = process.env.MOCK_BANK_FAIL;
  return v === "true" || v === "1";
}

export class MockBankAdapter implements BankAdapter {
  async initiatePayout(line: PayoutLineInput): Promise<PayoutInitResult> {
    if (!line.iban?.trim()) {
      return { bank_ref: "", status: "REJECTED" };
    }
    if (mockBankFailEnabled()) {
      return { bank_ref: `MOCK-FAIL-${line.reference}`, status: "REJECTED" };
    }
    return { bank_ref: `MOCK-${line.reference}`, status: "ACCEPTED" };
  }
}

export type BankAdapterKind = "mock" | "none";

export function getBankAdapterKind(): BankAdapterKind {
  const raw = (process.env.BANK_ADAPTER ?? "mock").toLowerCase();
  if (raw === "none" || raw === "off" || raw === "disabled") return "none";
  return "mock";
}

export function isBankAutoEnabled(): boolean {
  return getBankAdapterKind() !== "none";
}

export function createBankAdapter(): BankAdapter | null {
  const kind = getBankAdapterKind();
  if (kind === "none") return null;
  return new MockBankAdapter();
}
