-- MINE-PAY-FLOW-1: mine payment tracking on period statement + batch metadata

ALTER TABLE "period_statements" ADD COLUMN "mine_payment_reference" TEXT;
ALTER TABLE "period_statements" ADD COLUMN "mine_paid_at" TIMESTAMP(3);
ALTER TABLE "period_statements" ADD COLUMN "metadata" JSONB;

ALTER TABLE "settlement_batches" ADD COLUMN "metadata" JSONB;
