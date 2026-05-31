import crypto from "crypto";
import { prisma } from "../db/prisma";
import { sendOtp } from "../services/notificationService";

export type OtpRequestResult =
  | { allowed: true; expiresInSeconds: number }
  | { allowed: false; retryAfterSeconds: number };

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "locked" | "invalid"; attemptsLeft?: number };

export class OtpsRepository {
  constructor(
    private opts: { otpTtlMs: number; maxRequests: number; windowMs: number } = {
      otpTtlMs: 5 * 60 * 1000,
      maxRequests: 5,
      windowMs: 60 * 1000,
    },
  ) {}

  async requestOtp(mobile_number: string): Promise<OtpRequestResult> {
    const now = new Date();
    const existing = await prisma.otps.findUnique({ where: { mobile_number } });

    let rateWindowStart = existing?.rate_window_start ?? now;
    let rateCount = existing?.rate_count ?? 0;

    if (now.getTime() - rateWindowStart.getTime() > this.opts.windowMs) {
      rateWindowStart = now;
      rateCount = 0;
    }

    if (rateCount >= this.opts.maxRequests) {
      const retryAfterSeconds = Math.ceil(
        (this.opts.windowMs - (now.getTime() - rateWindowStart.getTime())) / 1000,
      );
      return { allowed: false, retryAfterSeconds };
    }

    rateCount += 1;
    const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    const expiresAt = new Date(now.getTime() + this.opts.otpTtlMs);

    await prisma.otps.upsert({
      where: { mobile_number },
      create: {
        mobile_number,
        otp_code: otp,
        expires_at: expiresAt,
        attempts_left: 3,
        rate_window_start: rateWindowStart,
        rate_count: rateCount,
      },
      update: {
        otp_code: otp,
        expires_at: expiresAt,
        attempts_left: 3,
        verified_at: null,
        rate_window_start: rateWindowStart,
        rate_count: rateCount,
      },
    });

    try {
      await sendOtp(mobile_number, otp);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[otp:sms] delivery failed", err);
    }

    return { allowed: true, expiresInSeconds: Math.floor(this.opts.otpTtlMs / 1000) };
  }

  async verifyOtp(mobile_number: string, otp_code: string): Promise<OtpVerifyResult> {
    const record = await prisma.otps.findUnique({ where: { mobile_number } });
    if (!record) return { ok: false, reason: "not_found" };
    if (record.expires_at.getTime() < Date.now()) return { ok: false, reason: "expired" };
    if (record.attempts_left <= 0) return { ok: false, reason: "locked" };

    if (record.otp_code !== otp_code) {
      const attemptsLeft = record.attempts_left - 1;
      await prisma.otps.update({
        where: { mobile_number },
        data: { attempts_left: attemptsLeft },
      });
      return { ok: false, reason: "invalid", attemptsLeft };
    }

    await prisma.otps.update({
      where: { mobile_number },
      data: { verified_at: new Date() },
    });
    return { ok: true };
  }

  async debugGetOtp(mobile_number: string): Promise<{ otp: string; expiresAt: number } | null> {
    const record = await prisma.otps.findUnique({ where: { mobile_number } });
    if (!record) return null;
    return { otp: record.otp_code, expiresAt: record.expires_at.getTime() };
  }
}
