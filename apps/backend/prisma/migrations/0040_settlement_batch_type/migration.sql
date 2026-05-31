-- SET-CYCLE-1: dual settlement cycles (owner weekly / household monthly / legacy combined)

CREATE TYPE "SettlementBatchType" AS ENUM ('OWNER_WEEKLY', 'HOUSEHOLD_MONTHLY', 'COMBINED_LEGACY');

ALTER TABLE "settlement_batches"
  ADD COLUMN "batch_type" "SettlementBatchType" NOT NULL DEFAULT 'COMBINED_LEGACY';

CREATE INDEX "settlement_batches_mine_id_period_start_batch_type_idx"
  ON "settlement_batches"("mine_id", "period_start", "batch_type");
