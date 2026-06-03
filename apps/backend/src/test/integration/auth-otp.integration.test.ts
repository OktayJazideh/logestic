import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../db/prisma";
import { http, isServerUp, loginAs } from "../helpers/http";

describe("auth OTP integration", () => {
  let serverUp = false;

  beforeAll(async () => {
    serverUp = await isServerUp();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.runIf(() => serverUp)("request → verify → me (registered user)", async () => {
    // Use a seed mobile not used by loginAs() in other integration tests (avoids OTP rate limit).
    const mobile = "09000000006";

    const req = await http("/api/auth/request-otp", {
      method: "POST",
      body: JSON.stringify({ mobile_number: mobile }),
    });
    expect(req.status).toBe(200);
    expect(req.json.success).toBe(true);
    expect(req.json.data.expires_in_seconds).toBeGreaterThan(0);

    const devOtp = await http(`/api/auth/__dev/otp?mobile_number=${mobile}`);
    const code = devOtp.json?.data?.otp as string;
    expect(code).toMatch(/^\d{6}$/);

    const verify = await http("/api/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ mobile_number: mobile, otp_code: code }),
    });
    expect(verify.status).toBe(200);
    expect(verify.json.success).toBe(true);
    const token = verify.json.data.access_token as string;
    expect(token.length).toBeGreaterThan(10);

    const me = await http("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(200);
    expect(me.json.success).toBe(true);
    expect(me.json.data.mobile_number).toBe(mobile);
    expect(me.json.data.role).toBe("CONSULTANT");
  });

  it.runIf(() => serverUp)("rejects unregistered mobile on request-otp", async () => {
    const mobile = `09${String(Date.now()).slice(-9)}`;
    const req = await http("/api/auth/request-otp", {
      method: "POST",
      body: JSON.stringify({ mobile_number: mobile }),
    });
    expect(req.status).toBe(403);
    expect(req.json.success).toBe(false);
    expect(req.json.error?.code).toBe("user_not_registered");
  });

  it.runIf(() => serverUp)("loginAs helper issues valid session", async () => {
    const token = await loginAs("09000000000");
    const me = await http("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(me.json.data.role).toBe("ADMIN");
  });
});
