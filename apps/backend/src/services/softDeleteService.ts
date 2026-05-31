import { prisma } from "../db/prisma";
import {
  MODEL_TO_AUDIT_ENTITY,
  resolveSoftDeleteModel,
  runWithSoftDeleteBypass,
  type SoftDeleteModel,
} from "../lib/softDelete";
import { toBig } from "../repositories/id";
import * as auditRepo from "../repositories/auditLogsRepository";

export type SoftDeleteResult =
  | { ok: true; entity_type: string; entity_id: string; deleted_at: Date }
  | { ok: false; code: "invalid_entity_type" | "not_found" | "already_deleted" };

export type RestoreResult =
  | { ok: true; entity_type: string; entity_id: string; restored_at: Date }
  | { ok: false; code: "invalid_entity_type" | "not_found" | "not_deleted" };

type ModelDelegate = {
  findUnique: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
};

function modelDelegate(model: SoftDeleteModel): ModelDelegate {
  return (prisma as unknown as Record<string, ModelDelegate>)[model];
}

function auditEntityType(model: SoftDeleteModel): string {
  return MODEL_TO_AUDIT_ENTITY[model];
}

async function findByIdIncludingDeleted(
  model: SoftDeleteModel,
  entityId: string,
): Promise<{ row: Record<string, unknown>; deleted_at: Date | null } | null> {
  const id = BigInt(entityId);
  return runWithSoftDeleteBypass(async () => {
    const row = (await modelDelegate(model).findUnique({ where: { id } })) as
      | ({ deleted_at?: Date | null } & Record<string, unknown>)
      | null;
    if (!row) return null;
    return { row, deleted_at: row.deleted_at ?? null };
  });
}

export async function softDeleteEntity(params: {
  entity_type: string;
  entity_id: string;
  reason: string;
  performed_by_user_id: number;
}): Promise<SoftDeleteResult> {
  const model = resolveSoftDeleteModel(params.entity_type);
  if (!model) {
    return { ok: false, code: "invalid_entity_type" };
  }

  const existing = await findByIdIncludingDeleted(model, params.entity_id);
  if (!existing) {
    return { ok: false, code: "not_found" };
  }
  if (existing.deleted_at != null) {
    return { ok: false, code: "already_deleted" };
  }

  const deleted_at = new Date();
  const entityType = auditEntityType(model);

  await modelDelegate(model).update({
    where: { id: BigInt(params.entity_id) },
    data: { deleted_at },
  });

  await auditRepo.insertAuditLog({
    entity_type: entityType,
    entity_id: params.entity_id,
    action: "SOFT_DELETED",
    before_value: existing.row,
    after_value: { ...existing.row, deleted_at: deleted_at.toISOString() },
    performed_by_user_id: params.performed_by_user_id,
    reason: params.reason,
  });

  return { ok: true, entity_type: entityType, entity_id: params.entity_id, deleted_at };
}

export async function restoreEntity(params: {
  entity_type: string;
  entity_id: string;
  reason: string;
  performed_by_user_id: number;
}): Promise<RestoreResult> {
  const model = resolveSoftDeleteModel(params.entity_type);
  if (!model) {
    return { ok: false, code: "invalid_entity_type" };
  }

  const existing = await findByIdIncludingDeleted(model, params.entity_id);
  if (!existing) {
    return { ok: false, code: "not_found" };
  }
  if (existing.deleted_at == null) {
    return { ok: false, code: "not_deleted" };
  }

  const restored_at = new Date();
  const entityType = auditEntityType(model);

  await runWithSoftDeleteBypass(async () => {
    await modelDelegate(model).update({
      where: { id: BigInt(params.entity_id) },
      data: { deleted_at: null },
    });
  });

  await auditRepo.insertAuditLog({
    entity_type: entityType,
    entity_id: params.entity_id,
    action: "RESTORED",
    before_value: existing.row,
    after_value: { ...existing.row, deleted_at: null },
    performed_by_user_id: params.performed_by_user_id,
    reason: params.reason,
  });

  return { ok: true, entity_type: entityType, entity_id: params.entity_id, restored_at };
}

/** Hard-delete helper for tests only — never expose via HTTP. */
export async function hardDeleteEntityForTests(model: SoftDeleteModel, entityId: number): Promise<void> {
  await runWithSoftDeleteBypass(async () => {
    await modelDelegate(model).delete({ where: { id: toBig(entityId) } });
  });
}

/** Prisma delete on soft-delete models → sets deleted_at (via middleware). */
export async function prismaSoftDelete(
  model: SoftDeleteModel,
  entityId: number,
  reason: string,
  performedByUserId: number,
): Promise<SoftDeleteResult> {
  return softDeleteEntity({
    entity_type: model,
    entity_id: String(entityId),
    reason,
    performed_by_user_id: performedByUserId,
  });
}
