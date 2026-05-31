export type FormatMoneyOptions = {
  unit?: "toman" | "rial";
  showUnit?: boolean;
};

/** Display-only: DB/API amounts stay in Rial. */
export function rialToToman(rial: number): number {
  if (!Number.isFinite(rial) || rial < 0) return 0;
  return Math.floor(rial / 10);
}

function formatAmountFa(amount: number): string {
  const negative = amount < 0;
  const abs = Math.abs(Math.trunc(amount));
  const formatted = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(abs);
  return negative ? `−${formatted}` : formatted;
}

/**
 * Formats a Rial amount for UI (default: Toman with Persian digits).
 * @example formatMoney(10000) → «۱٬۰۰۰ تومان»
 */
export function formatMoney(rial: number, opts?: FormatMoneyOptions): string {
  const unit = opts?.unit ?? "toman";
  const showUnit = opts?.showUnit ?? true;
  const amount = unit === "toman" ? rialToToman(rial) : Number.isFinite(rial) && rial >= 0 ? Math.floor(rial) : 0;
  const formatted = formatAmountFa(amount);
  if (!showUnit) return formatted;
  return `${formatted} ${unit === "toman" ? "تومان" : "ریال"}`;
}
