import { prisma } from "../db/prisma";
import { toBig } from "./id";

export async function insertHouseholdApproval(params: {
  household_id: number;
  approver_user_id: number;
  role: string;
}): Promise<void> {
  await prisma.household_approvals.create({
    data: {
      household_id: toBig(params.household_id),
      approver_user_id: toBig(params.approver_user_id),
      role: params.role,
    },
  });
}

export async function countHouseholdApprovals(householdId: number): Promise<number> {
  return prisma.household_approvals.count({
    where: { household_id: toBig(householdId) },
  });
}

export async function deleteHouseholdApprovals(householdId: number): Promise<void> {
  await prisma.household_approvals.deleteMany({
    where: { household_id: toBig(householdId) },
  });
}
