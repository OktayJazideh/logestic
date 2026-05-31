/** Normalize to 10-digit Iranian national ID (digits only). */
export function normalizeNationalId(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Iranian national ID checksum (کد ملی). */
export function validateIranNationalIdChecksum(raw: string): boolean {
  const digits = normalizeNationalId(raw);
  if (!/^\d{10}$/.test(digits)) return false;
  if (/^(\d)\1{9}$/.test(digits)) return false;

  const check = Number(digits[9]);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]) * (10 - i);
  }
  const remainder = sum % 11;
  const expected = remainder < 2 ? remainder : 11 - remainder;
  return check === expected;
}

/** Build a valid 10-digit national ID from a 9-digit seed (for tests/seeds). */
export function nationalIdFromSeed(seed9: string): string {
  const base = seed9.replace(/\D/g, "").padStart(9, "0").slice(-9);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(base[i]) * (10 - i);
  }
  const remainder = sum % 11;
  const check = remainder < 2 ? remainder : 11 - remainder;
  return base + String(check);
}
