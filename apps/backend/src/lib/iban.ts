/** Normalize Iranian IBAN (IR + 24 digits). */
export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/** ISO 13616 mod-97 checksum (Iran: IR + 24 digits). */
export function validateIranIbanChecksum(iban: string): boolean {
  const n = normalizeIban(iban);
  if (!/^IR\d{24}$/.test(n)) return false;
  const rearranged = n.slice(4) + n.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let remainder = 0;
  for (let i = 0; i < expanded.length; i++) {
    remainder = (remainder * 10 + Number(expanded[i])) % 97;
  }
  return remainder === 1;
}

/** Display mask: IRxx ******** xxxx */
export function maskIban(iban: string | null | undefined): string {
  if (!iban?.trim()) return "—";
  const n = normalizeIban(iban);
  if (n.length < 8) return "—";
  return `${n.slice(0, 4)} ******** ${n.slice(-4)}`;
}
