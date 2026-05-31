import { OtpStore } from "../stores/otpStore";
import { SessionStore, type Session } from "../stores/sessionStore";
import { UserStore, type User } from "../stores/userStore";
import { UserRole, UserRoles } from "../types/userRole";
import { listRolePermissions } from "../types/permissions";
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

  async verifyOtp(mobile_number: string, otp_code: string) {
    const res = await this.otpStore.verifyOtp(mobile_number, otp_code);
    if (!res.ok) return { ok: false as const, reason: res.reason, attemptsLeft: (res as { attemptsLeft?: number }).attemptsLeft };

    let user = await this.userStore.getByMobile(mobile_number);
    if (!user) {
      const role: UserRole =
        env.DEV_ADMIN_MOBILE && mobile_number === env.DEV_ADMIN_MOBILE
          ? "ADMIN"
          : env.DEV_COOP_MOBILE && mobile_number === env.DEV_COOP_MOBILE
            ? "COOP_ADMIN"
            : env.DEV_EMPLOYER_MOBILE && mobile_number === env.DEV_EMPLOYER_MOBILE
              ? "EMPLOYER"
              : env.DEV_FLEET_OWNER_MOBILE && mobile_number === env.DEV_FLEET_OWNER_MOBILE
                ? "FLEET_OWNER"
                : env.DEV_HOUSEHOLD_MOBILE && mobile_number === env.DEV_HOUSEHOLD_MOBILE
                  ? "HOUSEHOLD"
                  : env.DEV_CONSULTANT_MOBILE && mobile_number === env.DEV_CONSULTANT_MOBILE
                    ? "CONSULTANT"
                    : "DRIVER";

      user = await this.userStore.upsertUserByMobile(mobile_number, role, { is_active: true });
    } else {
      user = await this.userStore.upsertUserByMobile(mobile_number, user.role, { is_active: true });
    }

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
