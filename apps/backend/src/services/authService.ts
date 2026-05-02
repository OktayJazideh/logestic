import { OtpStore } from "../stores/otpStore";
import { SessionStore, type Session } from "../stores/sessionStore";
import { UserStore, type User } from "../stores/userStore";
import { UserRole, UserRoles } from "../types/userRole";
import { env } from "../config/env";

export class AuthService {
  constructor(
    public otpStore: OtpStore,
    public userStore: UserStore,
    public sessionStore: SessionStore,
  ) {}

  validateRole(role: string): role is UserRole {
    return (UserRoles as readonly string[]).includes(role);
  }

  requestOtp(mobile_number: string) {
    return this.otpStore.requestOtp(mobile_number);
  }

  verifyOtp(mobile_number: string, otp_code: string) {
    const res = this.otpStore.verifyOtp(mobile_number, otp_code);
    if (!res.ok) return { ok: false as const, reason: res.reason, attemptsLeft: (res as any).attemptsLeft };

    // Create user if not exists yet.
    let user = this.userStore.getByMobile(mobile_number);
    if (!user) {
      // Default role in MVP: DRIVER (without KYC). For dev we can pre-seed roles via env vars.
      const role: UserRole =
        env.DEV_ADMIN_MOBILE && mobile_number === env.DEV_ADMIN_MOBILE
          ? "ADMIN"
          : env.DEV_COOP_MOBILE && mobile_number === env.DEV_COOP_MOBILE
            ? "COOP"
            : env.DEV_EMPLOYER_MOBILE && mobile_number === env.DEV_EMPLOYER_MOBILE
              ? "EMPLOYER"
              : env.DEV_FLEET_OWNER_MOBILE && mobile_number === env.DEV_FLEET_OWNER_MOBILE
                ? "FLEET_OWNER"
                : env.DEV_HOUSEHOLD_MOBILE && mobile_number === env.DEV_HOUSEHOLD_MOBILE
                  ? "HOUSEHOLD"
                  : env.DEV_CONSULTANT_MOBILE && mobile_number === env.DEV_CONSULTANT_MOBILE
                    ? "CONSULTANT"
                    : "DRIVER";

      user = this.userStore.upsertUserByMobile(mobile_number, role, { is_active: true });
    } else {
      user = this.userStore.upsertUserByMobile(mobile_number, user.role, { is_active: true });
    }

    const session = this.sessionStore.createSession({
      userId: user.id,
      mobile_number: user.mobile_number,
      role: user.role,
      is_active: user.is_active,
    });

    return { ok: true as const, session };
  }

  getSession(token: string): Session | null {
    return this.sessionStore.getSession(token);
  }

  getUserFromSession(token: string): { id: number; mobile_number: string; role: UserRole; is_active: boolean } | null {
    const s = this.getSession(token);
    if (!s) return null;
    if (!s.is_active) return null;
    return { id: s.userId, mobile_number: s.mobile_number, role: s.role, is_active: s.is_active };
  }

  listPermissions(role: UserRole): string[] {
    // Minimal permission model for MVP.
    const base: string[] = [];
    switch (role) {
      case "ADMIN":
        return ["*"];
      case "COOP":
        return ["coop:manage", "coop:read_audit"];
      case "EMPLOYER":
        return ["employer:read", "employer:submit_need"];
      case "DRIVER":
        return ["driver:read_missions", "driver:execute_steps"];
      case "FLEET_OWNER":
        return ["owner:read_finances", "owner:read_transactions"];
      case "HOUSEHOLD":
        return ["household:read_shares", "household:read_transactions"];
      case "CONSULTANT":
        return ["consultant:approve_hourly"];
      default:
        return base;
    }
  }

  listMyPermissions(sessionRole: UserRole) {
    return this.listPermissions(sessionRole);
  }
}

