export type SettlementBatchStatus = "DRAFT" | "LOCKED" | "PAID" | "CANCELLED";

export type SettlementBatch = {
  id: number;
  mine_id?: number;
  period_start: Date;
  period_end: Date;
  status: SettlementBatchStatus;
  created_by_user_id?: number;
  created_at: Date;
};

export type SettlementLine = {
  id: number;
  batch_id: number;
  wallet_id: number;
  amount: number;
  mission_id?: number;
  note?: string;
};

/**
 * In-memory settlement batches (mirror of settlement_batches / settlement_lines).
 */
export class SettlementStore {
  private batches: SettlementBatch[] = [];
  private lines: SettlementLine[] = [];
  private idBatch = 1;
  private idLine = 1;

  createDraft(params: {
    mine_id?: number;
    period_start: Date;
    period_end: Date;
    created_by_user_id?: number;
    lines: Array<{ wallet_id: number; amount: number; mission_id?: number; note?: string }>;
  }) {
    const batch: SettlementBatch = {
      id: this.idBatch++,
      mine_id: params.mine_id,
      period_start: params.period_start,
      period_end: params.period_end,
      status: "DRAFT",
      created_by_user_id: params.created_by_user_id,
      created_at: new Date(),
    };
    this.batches.push(batch);
    for (const l of params.lines) {
      this.lines.push({
        id: this.idLine++,
        batch_id: batch.id,
        wallet_id: l.wallet_id,
        amount: l.amount,
        mission_id: l.mission_id,
        note: l.note,
      });
    }
    return { batch, lines: this.lines.filter((x) => x.batch_id === batch.id) };
  }

  lock(batchId: number) {
    const b = this.batches.find((x) => x.id === batchId);
    if (!b || b.status !== "DRAFT") return { ok: false as const, reason: "invalid_batch" };
    b.status = "LOCKED";
    return { ok: true as const, batch: b };
  }

  markPaid(batchId: number) {
    const b = this.batches.find((x) => x.id === batchId);
    if (!b || b.status !== "LOCKED") return { ok: false as const, reason: "invalid_batch" };
    b.status = "PAID";
    return { ok: true as const, batch: b };
  }

  listBatches() {
    return this.batches.slice().sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  getLines(batchId: number) {
    return this.lines.filter((l) => l.batch_id === batchId);
  }
}
