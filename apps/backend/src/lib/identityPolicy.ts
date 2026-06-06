import { z } from "zod";
import { optionalPersianNameSchema, persianNameSchema } from "./persianText";
import { validateIranNationalIdChecksum } from "./nationalId";
import { validateIranIbanChecksum, normalizeIban } from "./iban";

export { optionalPersianNameSchema, persianNameSchema } from "./persianText";

/** Mobile is always required for account provisioning. */
export const PROVISIONING_MOBILE_REGEX = /^09\d{9}$/;

export function normalizeOptionalNationalId(raw?: string | null): string | undefined {
  const t = raw?.trim();
  return t || undefined;
}

export const optionalNationalIdSchema = z
  .string()
  .max(20)
  .optional()
  .transform((s) => normalizeOptionalNationalId(s));

export const requiredNationalIdSchema = z
  .string()
  .min(5)
  .max(20)
  .transform((s) => normalizeOptionalNationalId(s))
  .refine((s) => !!s && validateIranNationalIdChecksum(s), { message: "Invalid national ID" });

export const optionalIbanSchema = z
  .string()
  .max(34)
  .optional()
  .transform((s) => {
    const t = s?.trim();
    return t || undefined;
  });

export const requiredIbanSchema = z
  .string()
  .min(15)
  .max(34)
  .transform((s) => normalizeIban(s.trim()))
  .refine((s) => /^IR\d{24}$/.test(s) && validateIranIbanChecksum(s), { message: "Invalid IBAN" });

export const provisioningMobileSchema = z.string().regex(PROVISIONING_MOBILE_REGEX);

export const provisioningFullNameSchema = optionalPersianNameSchema;
