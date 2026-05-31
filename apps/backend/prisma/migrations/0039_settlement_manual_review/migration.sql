-- BANK-AUTO-1: partial payout failure → MANUAL_REVIEW (no batch rollback)
ALTER TYPE "SettlementBatchStatus" ADD VALUE IF NOT EXISTS 'MANUAL_REVIEW';
