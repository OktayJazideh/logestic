import { z } from "zod";
import { optionalPersianNameSchema, persianNameSchema } from "./persianText";

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

export const provisioningMobileSchema = z.string().regex(PROVISIONING_MOBILE_REGEX);

export const provisioningFullNameSchema = optionalPersianNameSchema;
