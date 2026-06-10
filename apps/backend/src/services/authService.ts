import { userHasPassword, verifyPassword } from "../lib/passwordHash";
import { OtpStore, type OtpRequestResult } from "../stores/otpStore";
import { SessionStore, type Session } from "../stores/sessionStore";
import { UserStore, type User } from "../stores/userStore";
import { UserRole, UserRoles } from "../types/userRole";
import { listRolePermissions } from "../types/permissions";

export type AuthOtpRequestResult =
  | OtpRequestResult
  | { allowed: false; reason: "not_registered" | "inactive" };

export type AuthVerifyFailureReason =
  | "not_found"
  | "expired"
  | "locked"
  | "invalid"
  | "not_registered"
  | "inactive"
  | "invalid_credentials"
  | "password_login_disabled";

export class AuthService {
  constructor(
    public otpStore: OtpStore,
    public userStore: UserStore,
    public sessionStore: SessionStore,
  ) {}

  validateRole(role: string): role is UserRole {
    return (UserRoles as readonly string[]).includes(role);
  }

  private async resolveLoginUser(
    mobile_number: string,
  ): Promise<{ ok: true; user: User } | { ok: false; reason: "not_registered" | "inactive" }> {
    const user = await this.userStore.getByMobile(mobile_number);
    if (!user) return { ok: false, reason: "not_registered" };
    if (!user.is_active) return { ok: false, reason: "inactive" };
    return { ok: true, user };
  }

  async requestOtp(mobile_number: string): Promise<AuthOtpRequestResult> {
    const gate = await this.resolveLoginUser(mobile_number);
    if (!gate.ok) {
      return { allowed: false, reason: gate.reason };
    }
    return this.otpStore.requestOtp(mobile_number);
  }

  /** Dev/UAT only — session without OTP/SMS (route must guard NODE_ENV). */
  async devLoginWithoutOtp(mobile_number: string) {
    const gate = await this.resolveLoginUser(mobile_number);
    if (!gate.ok) {
      return { ok: false as const, reason: gate.reason as AuthVerifyFailureReason };
    }
    const user = gate.user;
    const session = await this.sessionStore.createSession({
      userId: user.id,
      mobile_number: user.mobile_number,
      role: user.role,
      is_active: user.is_active,
    });
    return { ok: true as const, session };
  }

  async loginWithPassword(username: string, password: string) {
    const user = await this.userStore.getByUsername(username);
    if (!user || !user.is_active) {
      return { ok: false as const, reason: "invalid_credentials" as const };
    }
    if (!userHasPassword(user.password_hash)) {
      return { ok: false as const, reason: "invalid_credentials" as const };
    }
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return { ok: false as const, reason: "invalid_credentials" as const };
    }

    const session = await this.sessionStore.createSession({
      userId: user.id,
      mobile_number: user.mobile_number,
      role: user.role,
      is_active: user.is_active,
    });
    return { ok: true as const, session };
  }

  async verifyOtp(mobile_number: string, otp_code: string) {
    const gate = await this.resolveLoginUser(mobile_number);
    if (!gate.ok) {
      return { ok: false as const, reason: gate.reason as AuthVerifyFailureReason };
    }

    const res = await this.otpStore.verifyOtp(mobile_number, otp_code);
    if (!res.ok) {
      return {
        ok: false as const,
        reason: res.reason as AuthVerifyFailureReason,
        attemptsLeft: (res as { attemptsLeft?: number }).attemptsLeft,
      };
    }

    const user = gate.user;

    const session = await this.sessionStore.createSession({
      userId: user.id,
      mobile_number: user.mobile_number,
      role: user.role,
      is_active: user.is_active,
    });

    return { ok: true as const, session };
  }

  async getSession(token: string): Promise<Session | null> {
    return this.sessionStore.getSession(token);
  }

  async getUserFromSession(
    token: string,
  ): Promise<{
    id: number;
    mobile_number: string;
    role: UserRole;
    is_active: boolean;
    is_weighbridge_operator: boolean;
    cooperative_id?: number;
  } | null> {
    const s = await this.getSession(token);
    if (!s) return null;
    if (!s.is_active) return null;
    const user = await this.userStore.getById(s.userId);
    return {
      id: s.userId,
      mobile_number: s.mobile_number,
      role: s.role,
      is_active: s.is_active,
      is_weighbridge_operator: user?.is_weighbridge_operator ?? false,
      cooperative_id: user?.cooperative_id,
    };
  }

  listPermissions(role: UserRole): string[] {
    return listRolePermissions(role);
  }

  listMyPermissions(sessionRole: UserRole) {
    return this.listPermissions(sessionRole);
  }
}
