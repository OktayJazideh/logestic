import { describe, expect, it, vi } from "vitest";
import { hashPassword } from "../lib/passwordHash";
import { AuthService } from "./authService";
import type { User } from "../stores/userStore";
import type { UserAuthRow } from "../repositories/usersRepository";

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

  it("devLoginWithoutOtp creates session without OTP", async () => {
    const { svc, otpStore } = makeService(makeUser({ id: 1, role: "ADMIN", is_active: true }));
    const r = await svc.devLoginWithoutOtp(mobile);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.session.token).toBe("tok");
    expect(otpStore.requestOtp).not.toHaveBeenCalled();
    expect(otpStore.verifyOtp).not.toHaveBeenCalled();
  });
});

describe("AuthService loginWithPassword", () => {
  const username = "oktay";
  const password = "oktay1380";

  function makeAuthUser(
    partial: Partial<UserAuthRow> & Pick<UserAuthRow, "id" | "role" | "is_active" | "password_hash">,
  ): UserAuthRow {
    return {
      mobile_number: "09013019626",
      is_weighbridge_operator: false,
      created_at: new Date(),
      username,
      ...partial,
    };
  }

  function makePasswordService(user: UserAuthRow | null) {
    const otpStore = {
      requestOtp: vi.fn(),
      verifyOtp: vi.fn(),
    };
    const userStore = {
      getByMobile: vi.fn(),
      getByUsername: vi.fn().mockResolvedValue(user),
    };
    const sessionStore = {
      createSession: vi.fn().mockResolvedValue({
        token: "pwd-tok",
        userId: user?.id ?? 0,
        mobile_number: user?.mobile_number ?? "",
        role: user?.role ?? "ADMIN",
        is_active: true,
      }),
    };
    const svc = new AuthService(otpStore as never, userStore as never, sessionStore as never);
    return { svc, userStore, sessionStore };
  }

  it("creates session on valid credentials", async () => {
    const hash = await hashPassword(password);
    const { svc, sessionStore } = makePasswordService(
      makeAuthUser({ id: 1, role: "ADMIN", is_active: true, password_hash: hash }),
    );
    const r = await svc.loginWithPassword(username, password);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.session.token).toBe("pwd-tok");
    expect(sessionStore.createSession).toHaveBeenCalledOnce();
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword(password);
    const { svc, sessionStore } = makePasswordService(
      makeAuthUser({ id: 1, role: "ADMIN", is_active: true, password_hash: hash }),
    );
    const r = await svc.loginWithPassword(username, "wrong-password");
    expect(r).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(sessionStore.createSession).not.toHaveBeenCalled();
  });

  it("rejects user without password hash", async () => {
    const { svc, sessionStore } = makePasswordService(
      makeAuthUser({ id: 1, role: "ADMIN", is_active: true, password_hash: "" }),
    );
    const r = await svc.loginWithPassword(username, password);
    expect(r).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(sessionStore.createSession).not.toHaveBeenCalled();
  });

  it("rejects unknown username", async () => {
    const { svc, sessionStore } = makePasswordService(null);
    const r = await svc.loginWithPassword("nobody", password);
    expect(r).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(sessionStore.createSession).not.toHaveBeenCalled();
  });

  it("rejects inactive user", async () => {
    const hash = await hashPassword(password);
    const { svc, sessionStore } = makePasswordService(
      makeAuthUser({ id: 1, role: "ADMIN", is_active: false, password_hash: hash }),
    );
    const r = await svc.loginWithPassword(username, password);
    expect(r).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(sessionStore.createSession).not.toHaveBeenCalled();
  });
});
