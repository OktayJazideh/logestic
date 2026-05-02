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

/**
 * DEV/MVP in-memory audit log.
 * Replace with DB-backed implementation when PostgreSQL is ready.
 */
export class AuditLogStore {
  private logs: AuditLogRecord[] = [];

  record(entry: Omit<AuditLogRecord, "at_created">) {
    const rec: AuditLogRecord = { ...entry, at_created: new Date() };
    this.logs.push(rec);
    return rec;
  }

  getAll() {
    return this.logs.slice().reverse();
  }
}

