import crypto from "crypto";
import { UserRole } from "../types/userRole";
import * as sessionsRepo from "../repositories/sessionsRepository";

export type Session = sessionsRepo.SessionRow;

export class SessionStore {
  constructor(private opts?: { ttlMs?: number }) {
    this.opts ??= {};
    this.opts.ttlMs ??= 7 * 24 * 60 * 60 * 1000;
  }

  async createSession(params: {
    userId: number;
    mobile_number: string;
    role: UserRole;
    is_active: boolean;
  }) {
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + this.opts!.ttlMs!);
    return sessionsRepo.createSession({ token, expiresAt, ...params });
  }

  async getSession(token: string) {
    return sessionsRepo.getSession(token);
  }

  async setMine(token: string, mineId: number) {
    return sessionsRepo.setSessionMine(token, mineId);
  }
}
