import crypto from "crypto";
import { UserRole } from "../types/userRole";

export type Session = {
  token: string;
  userId: number;
  mobile_number: string;
  role: UserRole;
  is_active: boolean;
  mineId?: number;
  expiresAt: number;
};

export class SessionStore {
  private sessions = new Map<string, Session>();

  constructor(private opts?: { ttlMs?: number }) {
    this.opts ??= {};
    this.opts.ttlMs ??= 7 * 24 * 60 * 60 * 1000; // 7 days
  }

  createSession(params: {
    userId: number;
    mobile_number: string;
    role: UserRole;
    is_active: boolean;
  }) {
    const token = crypto.randomBytes(24).toString("hex");
    const session: Session = {
      token,
      userId: params.userId,
      mobile_number: params.mobile_number,
      role: params.role,
      is_active: params.is_active,
      mineId: undefined,
      expiresAt: Date.now() + this.opts!.ttlMs!,
    };
    this.sessions.set(token, session);
    return session;
  }

  getSession(token: string) {
    const s = this.sessions.get(token);
    if (!s) return null;
    if (s.expiresAt < Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    return s;
  }

  setMine(token: string, mineId: number) {
    const s = this.sessions.get(token);
    if (!s) return null;
    s.mineId = mineId;
    this.sessions.set(token, s);
    return s;
  }
}

