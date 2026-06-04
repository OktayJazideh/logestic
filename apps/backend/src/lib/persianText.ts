import { z } from "zod";
import { ApiError } from "../http/errors";

const ARABIC_TO_PERSIAN: Record<string, string> = {
  "\u064A": "\u06CC",
  "\u0643": "\u06A9",
};

/** Persian letters, space, ZWNJ — no Latin digits in names. */
const PERSIAN_NAME_PATTERN = /^[\u0600-\u06FF\u200c\s]+$/;

export function normalizePersianText(value: string): string {
  let s = value.trim().replace(/\s+/g, " ");
  for (const [ar, fa] of Object.entries(ARABIC_TO_PERSIAN)) {
    s = s.split(ar).join(fa);
  }
  return s;
}

export function isPersianName(value: string): boolean {
  const n = normalizePersianText(value);
  if (n.length < 2 || n.length > 200) return false;
  if (!PERSIAN_NAME_PATTERN.test(n)) return false;
  return /[\u0600-\u06FF]/.test(n);
}

export function assertPersianName(value: string, requestId?: string): string {
  const n = normalizePersianText(value);
  if (!isPersianName(n)) {
    throw new ApiError({
      statusCode: 400,
      code: "invalid_persian_name",
      message: "Name must be in Persian (at least 2 characters)",
      requestId,
    });
  }
  return n;
}

export function optionalPersianName(value: string | undefined | null, requestId?: string): string | undefined {
  const t = value?.trim();
  if (!t) return undefined;
  return assertPersianName(t, requestId);
}

export const persianNameSchema = z
  .string()
  .min(1)
  .transform((s) => normalizePersianText(s))
  .refine(isPersianName, { message: "invalid_persian_name" });

export const optionalPersianNameSchema = z
  .string()
  .max(200)
  .optional()
  .refine((s) => s === undefined || !s.trim() || isPersianName(normalizePersianText(s)), {
    message: "invalid_persian_name",
  })
  .transform((s) => (s?.trim() ? normalizePersianText(s.trim()) : undefined));
