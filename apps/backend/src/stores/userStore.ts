import { UserRole } from "../types/userRole";

export type User = {
  id: number;
  mobile_number: string;
  role: UserRole;
  is_active: boolean;
  created_at: Date;
};

/**
 * DEV/MVP in-memory user store.
 * Replace with DB-backed repository when Postgres is ready.
 */
export class UserStore {
  private users = new Map<string, User>(); // key: mobile_number
  private idSeq = 1;

  upsertUserByMobile(mobile_number: string, role: UserRole, patch?: Partial<Omit<User, "id" | "mobile_number">>) {
    const existing = this.users.get(mobile_number);
    if (existing) {
      // In MVP/DEV we repeatedly seed roles; make sure `role` can be updated.
      const updated: User = { ...existing, role, ...(patch ?? {}) };
      this.users.set(mobile_number, updated);
      return updated;
    }

    const user: User = {
      id: this.idSeq++,
      mobile_number,
      role,
      is_active: patch?.is_active ?? false,
      created_at: new Date(),
    };
    this.users.set(mobile_number, user);
    return user;
  }

  getByMobile(mobile_number: string) {
    return this.users.get(mobile_number) ?? null;
  }
}

