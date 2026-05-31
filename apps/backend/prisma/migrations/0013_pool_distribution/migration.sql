-- POOL-1: POOL_DISTRIBUTION transaction type + link to community_pools
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'POOL_DISTRIBUTION';

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "community_pool_id" BIGINT;

DO $$ BEGIN
  ALTER TABLE "transactions"
    ADD CONSTRAINT "transactions_community_pool_id_fkey"
    FOREIGN KEY ("community_pool_id") REFERENCES "community_pools"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "transactions_community_pool_id_idx" ON "transactions"("community_pool_id");
