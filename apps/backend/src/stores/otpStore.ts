import crypto from "crypto";

type OtpRecord = {
  otp: string;
  expiresAt: number;
  attemptsLeft: number;
  verifiedAt?: number;
};

type RateState = {
  windowStartMs: number;
  count: number;
};

/**
 * DEV/MVP in-memory OTP store.
 * Later this can be replaced with a DB-backed implementation without changing route logic.
 */
export class OtpStore {
  private otps = new Map<string, OtpRecord>(); // key: mobile_number
  private rate = new Map<string, RateState>(); // key: mobile_number

  constructor(private opts?: { otpTtlMs?: number; maxRequests?: number; windowMs?: number }) {
    this.opts ??= {};
    this.opts.otpTtlMs ??= 5 * 60 * 1000;
    this.opts.maxRequests ??= 5;
    this.opts.windowMs ??= 60 * 1000;
  }

  requestOtp(mobile_number: string) {
    const now = Date.now();
    const r = this.rate.get(mobile_number) ?? { windowStartMs: now, count: 0 };
    if (now - r.windowStartMs > this.opts!.windowMs!) {
      r.windowStartMs = now;
      r.count = 0;
    }

    if (r.count >= this.opts!.maxRequests!) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((this.opts!.windowMs! - (now - r.windowStartMs)) / 1000),
      };
    }

    r.count += 1;
    this.rate.set(mobile_number, r);

    const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    const record: OtpRecord = {
      otp,
      expiresAt: now + this.opts!.otpTtlMs!,
      attemptsLeft: 3,
    };
    this.otps.set(mobile_number, record);

    // eslint-disable-next-line no-console
    console.log(`[DEV] OTP for ${mobile_number}: ${otp}`);

    return {
      allowed: true,
      expiresInSeconds: Math.floor(this.opts!.otpTtlMs! / 1000),
    };
  }

  verifyOtp(mobile_number: string, otp_code: string) {
    const record = this.otps.get(mobile_number);
    if (!record) return { ok: false as const, reason: "not_found" as const };
    if (record.expiresAt < Date.now()) return { ok: false as const, reason: "expired" as const };
    if (record.attemptsLeft <= 0) return { ok: false as const, reason: "locked" as const };

    if (record.otp !== otp_code) {
      record.attemptsLeft -= 1;
      this.otps.set(mobile_number, record);
      return { ok: false as const, reason: "invalid" as const, attemptsLeft: record.attemptsLeft };
    }

    record.verifiedAt = Date.now();
    this.otps.set(mobile_number, record);
    return { ok: true as const };
  }

  /**
   * DEV ONLY: used by smoke tests.
   */
  debugGetOtp(mobile_number: string): { otp: string; expiresAt: number } | null {
    const record = this.otps.get(mobile_number);
    if (!record) return null;
    return { otp: record.otp, expiresAt: record.expiresAt };
  }
}

