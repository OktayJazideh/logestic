import { prisma } from "../db/prisma";
import * as auditRepo from "../repositories/auditLogsRepository";

export type AuditLogRecord = {
  entity_type: string;
  entity_id: string;
  action: string;
  before_value?: unknown;
  after_value?: unknown;
  performed_by_user_id?: number;
  reason?: string;
  requestId?: string;
  at_created: Date;
};

export class AuditLogStore {
  async record(entry: Omit<AuditLogRecord, "at_created">) {
    const rec = await auditRepo.insertAuditLog(entry);
    return {
      entity_type: rec.entity_type,
      entity_id: rec.entity_id,
      action: rec.action,
      before_value: rec.before_value,
      after_value: rec.after_value,
      performed_by_user_id: rec.performed_by_user_id,
      reason: rec.reason,
      at_created: rec.at_created,
    };
  }

  listByEntity(entity_type: string, entity_id: string) {
    return auditRepo.listAuditLogsByEntity(entity_type, entity_id);
  }

  async getAll() {
    const rows = await prisma.audit_logs.findMany({ orderBy: { created_at: "desc" }, take: 500 });
    return rows.map((r) => ({
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      action: r.action,
      before_value: r.before_value ?? undefined,
      after_value: r.after_value ?? undefined,
      performed_by_user_id: r.performed_by_user_id != null ? Number(r.performed_by_user_id) : undefined,
      reason: r.reason ?? undefined,
      at_created: r.created_at,
    }));
  }
}
