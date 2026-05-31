import { UserRole } from "../types/userRole";
import * as usersRepo from "../repositories/usersRepository";

export type User = usersRepo.UserRow;

export class UserStore {
  async upsertUserByMobile(
    mobile_number: string,
    role: UserRole,
    patch?: Partial<Pick<User, "is_active" | "cooperative_id" | "is_weighbridge_operator">>,
  ) {
    return usersRepo.upsertUserByMobile(mobile_number, role, patch);
  }

  async getByMobile(mobile_number: string) {
    return usersRepo.findUserByMobile(mobile_number);
  }

  async getById(id: number) {
    return usersRepo.findUserById(id);
  }

  async listUsers() {
    return usersRepo.listUsers();
  }

  async updateUserRole(userId: number, role: UserRole, cooperative_id?: number | null) {
    return usersRepo.updateUserRole(userId, role, cooperative_id);
  }

  async migrateLegacyCoopRoles() {
    return usersRepo.migrateLegacyCoopRoles();
  }

  setWeighbridgeOperator(userId: number, enabled: boolean) {
    return usersRepo.setWeighbridgeOperator(userId, enabled);
  }
}
