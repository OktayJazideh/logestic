-- SET-1 part 1: new enum values (must commit before use in updates)

ALTER TYPE "SettlementBatchStatus" ADD VALUE IF NOT EXISTS 'CALCULATED';
ALTER TYPE "SettlementBatchStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_SETTLEMENT';
ALTER TYPE "SettlementBatchStatus" ADD VALUE IF NOT EXISTS 'IN_BANK_QUEUE';
ALTER TYPE "SettlementBatchStatus" ADD VALUE IF NOT EXISTS 'SETTLED';
ALTER TYPE "SettlementBatchStatus" ADD VALUE IF NOT EXISTS 'FAILED';
