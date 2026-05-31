import * as settlementRepo from "../repositories/settlementRepository";

export type SettlementBatch = settlementRepo.SettlementBatchRow;
export type SettlementLine = settlementRepo.SettlementLineRow;
export type SettlementExportRow = settlementRepo.SettlementExportRow;

export class SettlementStore {
  createDraft(params: Parameters<typeof settlementRepo.createDraft>[0]) {
    return settlementRepo.createDraft(params);
  }

  monthlyClose(params: Parameters<typeof settlementRepo.monthlyClose>[0]) {
    return settlementRepo.monthlyClose(params);
  }

  approveBatch(params: Parameters<typeof settlementRepo.approveBatch>[0]) {
    return settlementRepo.approveBatch(params);
  }

  lock(batchId: number, lockedByUserId: number) {
    return settlementRepo.lockBatch(batchId, lockedByUserId);
  }

  sendToBank(batchId: number) {
    return settlementRepo.sendToBank(batchId);
  }

  markPaid(batchId: number, payment_reference: string, receipt_file_url: string) {
    return settlementRepo.markBatchPaid(batchId, payment_reference, receipt_file_url);
  }

  markFailed(batchId: number, reason: string, performedByUserId?: number) {
    return settlementRepo.markBatchFailed(batchId, reason, performedByUserId);
  }

  listBatches(params?: { mine_id?: number }) {
    return settlementRepo.listBatches(params);
  }

  getBatch(batchId: number) {
    return settlementRepo.getBatch(batchId);
  }

  getLines(batchId: number) {
    return settlementRepo.getLines(batchId);
  }

  buildExportRows(batchId: number) {
    return settlementRepo.buildExportRows(batchId);
  }

  buildOwnerExportRows(batchId: number) {
    return settlementRepo.buildOwnerExportRows(batchId);
  }

  buildHouseholdExportRows(batchId: number) {
    return settlementRepo.buildHouseholdExportRows(batchId);
  }

  ownerWeeklyClose(params: Parameters<typeof settlementRepo.ownerWeeklyClose>[0]) {
    return settlementRepo.ownerWeeklyClose(params);
  }

  householdMonthlyClose(params: Parameters<typeof settlementRepo.householdMonthlyClose>[0]) {
    return settlementRepo.householdMonthlyClose(params);
  }

  buildMinePaymentExportRows(statementId: number) {
    return settlementRepo.buildMinePaymentExportRows(statementId);
  }

  exportRowsToCsv(rows: settlementRepo.SettlementExportRow[], kind?: "internal" | "mine" | "owner" | "household") {
    return settlementRepo.exportRowsToCsv(rows, kind);
  }
}
