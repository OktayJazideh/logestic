import { UserRole } from "../types/userRole";
import * as usersRepo from "../repositories/usersRepository";

export type User = usersRepo.UserRow;

export class UserStore {
  async upsertUserByMobile(
    mobile_number: string,
    role: UserRole,
    patch?: Partial<
      Pick<User, "is_active" | "cooperative_id" | "is_weighbridge_operator" | "national_id" | "full_name">
    >,
  ) {
    return usersRepo.upsertUserByMobile(mobile_number, role, patch);
  }

  async getByMobile(mobile_number: string) {
    return usersRepo.findUserByMobile(mobile_number);
  }

  async getByUsername(username: string) {
    return usersRepo.findUserByUsername(username);
  }

  async getById(id: number) {
    return usersRepo.findUserById(id);
  }

  async listUsers(opts?: { includeDeleted?: boolean }) {
    return usersRepo.listUsers(opts);
  }

  async updateUserRole(userId: number, role: UserRole, cooperative_id?: number | null) {
    return usersRepo.updateUserRole(userId, role, cooperative_id);
  }

  async createUser(input: Parameters<typeof usersRepo.createUser>[0]) {
    return usersRepo.createUser(input);
  }

  async updateUser(userId: number, data: Parameters<typeof usersRepo.updateUser>[1]) {
    return usersRepo.updateUser(userId, data);
  }

  async updateUserCredentials(userId: number, data: Parameters<typeof usersRepo.updateUserCredentials>[1]) {
    return usersRepo.updateUserCredentials(userId, data);
  }

  async deactivateAndSoftDeleteUser(userId: number) {
    return usersRepo.deactivateAndSoftDeleteUser(userId);
  }

  async migrateLegacyCoopRoles() {
    return usersRepo.migrateLegacyCoopRoles();
  }

  setWeighbridgeOperator(userId: number, enabled: boolean) {
    return usersRepo.setWeighbridgeOperator(userId, enabled);
  }
}
