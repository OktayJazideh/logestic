import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./authService";
import type { User } from "../stores/userStore";

describe("AuthService registration gate", () => {
  const mobile = "09013019626";

  function makeUser(partial: Partial<User> & Pick<User, "id" | "role" | "is_active">): User {
    return {
      mobile_number: mobile,
      is_weighbridge_operator: false,
      created_at: new Date(),
      ...partial,
    };
  }

  function makeService(user: User | null) {
    const otpStore = {
      requestOtp: vi.fn().mockResolvedValue({ allowed: true, expiresInSeconds: 300 }),
      verifyOtp: vi.fn().mockResolvedValue({ ok: true }),
    };
    const userStore = {
      getByMobile: vi.fn().mockResolvedValue(user),
    };
    const sessionStore = {
      createSession: vi.fn().mockResolvedValue({
        token: "tok",
        userId: user?.id ?? 0,
        mobile_number: mobile,
        role: user?.role ?? "DRIVER",
        is_active: true,
      }),
    };
    const svc = new AuthService(otpStore as never, userStore as never, sessionStore as never);
    return { svc, otpStore, userStore };
  }

  it("blocks request-otp when mobile is not registered", async () => {
    const { svc, otpStore } = makeService(null);
    const r = await svc.requestOtp(mobile);
    expect(r).toEqual({ allowed: false, reason: "not_registered" });
    expect(otpStore.requestOtp).not.toHaveBeenCalled();
  });

  it("blocks request-otp when user is inactive", async () => {
    const { svc, otpStore } = makeService(
      makeUser({ id: 1, role: "DRIVER", is_active: false }),
    );
    const r = await svc.requestOtp(mobile);
    expect(r).toEqual({ allowed: false, reason: "inactive" });
    expect(otpStore.requestOtp).not.toHaveBeenCalled();
  });

  it("allows request-otp for active registered user", async () => {
    const { svc, otpStore } = makeService(
      makeUser({ id: 1, role: "ADMIN", is_active: true }),
    );
    const r = await svc.requestOtp(mobile);
    expect(r).toEqual({ allowed: true, expiresInSeconds: 300 });
    expect(otpStore.requestOtp).toHaveBeenCalledWith(mobile);
  });

  it("blocks verify-otp when mobile is not registered", async () => {
    const { svc, otpStore } = makeService(null);
    const r = await svc.verifyOtp(mobile, "123456");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_registered");
    expect(otpStore.verifyOtp).not.toHaveBeenCalled();
  });
});
