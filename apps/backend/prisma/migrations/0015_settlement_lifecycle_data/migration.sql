-- SET-1 part 2: migrate data + schema (after enum values committed)

UPDATE "settlement_batches" SET status = 'READY_FOR_SETTLEMENT' WHERE status = 'LOCKED';
UPDATE "settlement_batches" SET status = 'SETTLED' WHERE status = 'PAID';

ALTER TABLE "settlement_batches"
  ADD COLUMN IF NOT EXISTS "sent_to_bank_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "receipt_file_url" TEXT,
  ADD COLUMN IF NOT EXISTS "failure_reason" TEXT;

CREATE INDEX IF NOT EXISTS "settlement_batches_mine_id_period_start_idx"
  ON "settlement_batches"("mine_id", "period_start");

ALTER TABLE "payment_payouts" ADD COLUMN IF NOT EXISTS "settlement_line_id" BIGINT;

UPDATE "payment_payouts" pp
SET "settlement_line_id" = sl.id
FROM "settlement_lines" sl
WHERE pp."settlement_batch_id" = sl."batch_id"
  AND pp."settlement_line_id" IS NULL
  AND sl.id = (
    SELECT MIN(sl2.id) FROM "settlement_lines" sl2 WHERE sl2."batch_id" = pp."settlement_batch_id"
  );

ALTER TABLE "payment_payouts" DROP CONSTRAINT IF EXISTS "payment_payouts_settlement_batch_id_key";

DO $$ BEGIN
  ALTER TABLE "payment_payouts"
    ADD CONSTRAINT "payment_payouts_settlement_line_id_fkey"
    FOREIGN KEY ("settlement_line_id") REFERENCES "settlement_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "payment_payouts_settlement_line_id_key"
  ON "payment_payouts"("settlement_line_id");

CREATE INDEX IF NOT EXISTS "payment_payouts_settlement_batch_id_idx"
  ON "payment_payouts"("settlement_batch_id");
