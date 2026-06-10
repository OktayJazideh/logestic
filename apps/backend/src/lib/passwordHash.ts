import crypto from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(crypto.scrypt);

export const PASSWORD_MIN_LENGTH = 6;
const USERNAME_REGEX = /^[a-z][a-z0-9._-]{2,31}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): string | null {
  const username = normalizeUsername(raw);
  if (!USERNAME_REGEX.test(username)) {
    return "نام کاربری باید ۳ تا ۳۲ کاراکتر انگلیسی (حروف کوچک، عدد، . _ -) باشد.";
  }
  return null;
}

export function validatePassword(raw: string): string | null {
  if (raw.length < PASSWORD_MIN_LENGTH) {
    return `رمز عبور حداقل ${PASSWORD_MIN_LENGTH} کاراکتر باشد.`;
  }
  return null;
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = (await scryptAsync(plain, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored || !stored.startsWith("scrypt$")) return false;
  const parts = stored.split("$");
  if (parts.length !== 3) return false;
  const salt = parts[1]!;
  const expectedHex = parts[2]!;
  const derived = (await scryptAsync(plain, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function userHasPassword(password_hash: string | null | undefined): boolean {
  return Boolean(password_hash && password_hash.length > 0);
}
