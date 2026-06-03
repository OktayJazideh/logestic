import type { ApprovalStatus, ProvisioningUnitType, UserRole } from "@prisma/client";
import { prisma } from "../db/prisma";
import { runWithSoftDeleteBypass } from "../lib/softDelete";
import { toBig, toNum } from "./id";

export type ProvisioningRequestRow = {
  id: number;
  status: ApprovalStatus;
  unit_type: ProvisioningUnitType;
  requester_user_id: number;
  cooperative_id?: number;
  mine_id?: number;
  target_role: UserRole;
  mobile_number: string;
  national_id: string;
  full_name?: string;
  note?: string;
  rejection_reason?: string;
  reviewed_by_user_id?: number;
  reviewed_at?: Date;
  created_user_id?: number;
  created_at: Date;
  updated_at: Date;
};

function mapRow(row: {
  id: bigint;
  status: ApprovalStatus;
  unit_type: ProvisioningUnitType;
  requester_user_id: bigint;
  cooperative_id: bigint | null;
  mine_id: bigint | null;
  target_role: UserRole;
  mobile_number: string;
  national_id: string;
  full_name: string | null;
  note: string | null;
  rejection_reason: string | null;
  reviewed_by_user_id: bigint | null;
  reviewed_at: Date | null;
  created_user_id: bigint | null;
  created_at: Date;
  updated_at: Date;
}): ProvisioningRequestRow {
  return {
    id: toNum(row.id),
    status: row.status,
    unit_type: row.unit_type,
    requester_user_id: toNum(row.requester_user_id),
    cooperative_id: row.cooperative_id != null ? toNum(row.cooperative_id) : undefined,
    mine_id: row.mine_id != null ? toNum(row.mine_id) : undefined,
    target_role: row.target_role,
    mobile_number: row.mobile_number,
    national_id: row.national_id,
    full_name: row.full_name ?? undefined,
    note: row.note ?? undefined,
    rejection_reason: row.rejection_reason ?? undefined,
    reviewed_by_user_id: row.reviewed_by_user_id != null ? toNum(row.reviewed_by_user_id) : undefined,
    reviewed_at: row.reviewed_at ?? undefined,
    created_user_id: row.created_user_id != null ? toNum(row.created_user_id) : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createProvisioningRequest(input: {
  unit_type: ProvisioningUnitType;
  requester_user_id: number;
  cooperative_id?: number;
  mine_id?: number;
  target_role: UserRole;
  mobile_number: string;
  national_id: string;
  full_name?: string;
  note?: string;
}): Promise<ProvisioningRequestRow> {
  const row = await prisma.user_provisioning_requests.create({
    data: {
      unit_type: input.unit_type,
      requester_user_id: toBig(input.requester_user_id),
      cooperative_id: input.cooperative_id != null ? toBig(input.cooperative_id) : null,
      mine_id: input.mine_id != null ? toBig(input.mine_id) : null,
      target_role: input.target_role,
      mobile_number: input.mobile_number,
      national_id: input.national_id,
      full_name: input.full_name ?? null,
      note: input.note ?? null,
    },
  });
  return mapRow(row);
}

export async function findProvisioningRequestById(id: number): Promise<ProvisioningRequestRow | null> {
  const row = await prisma.user_provisioning_requests.findUnique({ where: { id: toBig(id) } });
  return row ? mapRow(row) : null;
}

export async function listProvisioningRequestsForRequester(
  requesterUserId: number,
  opts?: { cooperativeId?: number; status?: ApprovalStatus },
): Promise<ProvisioningRequestRow[]> {
  const rows = await prisma.user_provisioning_requests.findMany({
    where: {
      requester_user_id: toBig(requesterUserId),
      ...(opts?.cooperativeId != null ? { cooperative_id: toBig(opts.cooperativeId) } : {}),
      ...(opts?.status ? { status: opts.status } : {}),
    },
    orderBy: { id: "desc" },
  });
  return rows.map(mapRow);
}

export async function listProvisioningRequestsForCooperative(
  cooperativeId: number,
  opts?: { status?: ApprovalStatus },
): Promise<ProvisioningRequestRow[]> {
  const rows = await prisma.user_provisioning_requests.findMany({
    where: {
      cooperative_id: toBig(cooperativeId),
      ...(opts?.status ? { status: opts.status } : {}),
    },
    orderBy: { id: "desc" },
  });
  return rows.map(mapRow);
}

export async function listProvisioningRequestsForMine(
  mineId: number,
  opts?: { status?: ApprovalStatus },
): Promise<ProvisioningRequestRow[]> {
  const rows = await prisma.user_provisioning_requests.findMany({
    where: {
      mine_id: toBig(mineId),
      ...(opts?.status ? { status: opts.status } : {}),
    },
    orderBy: { id: "desc" },
  });
  return rows.map(mapRow);
}

export async function listProvisioningRequestsAdmin(opts?: {
  status?: ApprovalStatus;
}): Promise<ProvisioningRequestRow[]> {
  const rows = await prisma.user_provisioning_requests.findMany({
    where: opts?.status ? { status: opts.status } : undefined,
    orderBy: { id: "desc" },
  });
  return rows.map(mapRow);
}

export async function findPendingByMobileOrNationalId(
  mobile: string,
  nationalId: string,
): Promise<ProvisioningRequestRow | null> {
  const row = await prisma.user_provisioning_requests.findFirst({
    where: {
      status: "PENDING",
      OR: [{ mobile_number: mobile }, { national_id: nationalId }],
    },
  });
  return row ? mapRow(row) : null;
}

export async function findPendingByMobile(mobile: string): Promise<ProvisioningRequestRow | null> {
  const row = await prisma.user_provisioning_requests.findFirst({
    where: { status: "PENDING", mobile_number: mobile },
  });
  return row ? mapRow(row) : null;
}

export async function approveProvisioningRequest(
  id: number,
  reviewerUserId: number,
  createdUserId: number,
): Promise<ProvisioningRequestRow | null> {
  try {
    const row = await prisma.user_provisioning_requests.update({
      where: { id: toBig(id) },
      data: {
        status: "APPROVED",
        reviewed_by_user_id: toBig(reviewerUserId),
        reviewed_at: new Date(),
        created_user_id: toBig(createdUserId),
      },
    });
    return mapRow(row);
  } catch {
    return null;
  }
}

export async function rejectProvisioningRequest(
  id: number,
  reviewerUserId: number,
  reason: string,
): Promise<ProvisioningRequestRow | null> {
  try {
    const row = await prisma.user_provisioning_requests.update({
      where: { id: toBig(id) },
      data: {
        status: "REJECTED",
        reviewed_by_user_id: toBig(reviewerUserId),
        reviewed_at: new Date(),
        rejection_reason: reason,
      },
    });
    return mapRow(row);
  } catch {
    return null;
  }
}

export async function findUserByMobileIncludingDeleted(mobile: string) {
  return runWithSoftDeleteBypass(() =>
    prisma.users.findFirst({ where: { mobile_number: mobile } }),
  );
}

export async function findUserByNationalIdIncludingDeleted(nationalId: string) {
  return runWithSoftDeleteBypass(() =>
    prisma.users.findFirst({ where: { national_id: nationalId } }),
  );
}
