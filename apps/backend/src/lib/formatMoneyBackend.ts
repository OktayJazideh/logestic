/** Display-only money formatting for PDF/receipts (DB stays in rial). */
export function rialToToman(rial: number): number {
  return Math.round(rial / 10);
}

export function formatRialFa(rial: number): string {
  return `${Math.round(rial).toLocaleString("fa-IR")} ریال`;
}

export function formatTomanFa(rial: number): string {
  return `${rialToToman(rial).toLocaleString("fa-IR")} تومان`;
}
