-- RATE-1: versioned rate cards with status lifecycle

ALTER TABLE "rate_cards" RENAME COLUMN "rate_per_ton" TO "rate";
ALTER TABLE "rate_cards" RENAME COLUMN "valid_from" TO "effective_from";
ALTER TABLE "rate_cards" RENAME COLUMN "valid_to" TO "effective_to";

ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "cooperative_id" BIGINT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "operation_type" TEXT NOT NULL DEFAULT 'TONNAGE';
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "unit_type" TEXT NOT NULL DEFAULT 'TON';
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "created_by" BIGINT;

UPDATE "rate_cards" SET "operation_type" = 'HOURLY', "unit_type" = 'HOUR' WHERE "material_type" = 'HOURLY';
UPDATE "rate_cards" SET "operation_type" = 'TONNAGE', "unit_type" = 'TON' WHERE "material_type" <> 'HOURLY';
UPDATE "rate_cards" SET "status" = 'ACTIVE' WHERE "status" IS NULL OR "status" = '';

ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_cooperative_id_fkey"
  FOREIGN KEY ("cooperative_id") REFERENCES "cooperatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "rate_cards_mine_op_material_status_idx"
  ON "rate_cards"("mine_id", "operation_type", "material_type", "status");
