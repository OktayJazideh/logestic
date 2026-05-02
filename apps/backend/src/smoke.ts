import assert from "node:assert/strict";
import { OtpStore } from "./stores/otpStore";

async function main() {
  const otp = new OtpStore({ otpTtlMs: 60_000, maxRequests: 3, windowMs: 10_000 });
  const mobile = "09123456789";

  const r1 = otp.requestOtp(mobile);
  assert.equal(r1.allowed, true);
  assert.ok(otp.debugGetOtp(mobile));

  const r2 = otp.requestOtp(mobile);
  assert.equal(r2.allowed, true);

  const r3 = otp.requestOtp(mobile);
  assert.equal(r3.allowed, true);

  const r4 = otp.requestOtp(mobile);
  assert.equal(r4.allowed, false);
  if (!r4.allowed) {
    assert.ok(typeof r4.retryAfterSeconds === "number");
    assert.ok(r4.retryAfterSeconds >= 0);
  }

  const otpLatest = otp.debugGetOtp(mobile);
  assert.ok(otpLatest);
  const { otp: code1 } = otpLatest!;
  const vBad = otp.verifyOtp(mobile, "000000");
  assert.equal(vBad.ok, false);

  const vGood = otp.verifyOtp(mobile, code1);
  assert.equal(vGood.ok, true);

  console.log("SMOKE OK: OTP store rate-limit + verify flow");
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

