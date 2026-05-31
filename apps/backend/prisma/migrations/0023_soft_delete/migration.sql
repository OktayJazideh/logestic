-- SOFT-1: global soft delete on key entity tables

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
ALTER TABLE "fleet_owners" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
ALTER TABLE "cooperatives" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
ALTER TABLE "operation_needs" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
ALTER TABLE "finance_rules" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "users_deleted_at_idx" ON "users"("deleted_at");
CREATE INDEX IF NOT EXISTS "households_deleted_at_idx" ON "households"("deleted_at");
CREATE INDEX IF NOT EXISTS "drivers_deleted_at_idx" ON "drivers"("deleted_at");
CREATE INDEX IF NOT EXISTS "vehicles_deleted_at_idx" ON "vehicles"("deleted_at");
CREATE INDEX IF NOT EXISTS "fleet_owners_deleted_at_idx" ON "fleet_owners"("deleted_at");
CREATE INDEX IF NOT EXISTS "cooperatives_deleted_at_idx" ON "cooperatives"("deleted_at");
CREATE INDEX IF NOT EXISTS "rate_cards_deleted_at_idx" ON "rate_cards"("deleted_at");
CREATE INDEX IF NOT EXISTS "operation_needs_deleted_at_idx" ON "operation_needs"("deleted_at");
CREATE INDEX IF NOT EXISTS "finance_rules_deleted_at_idx" ON "finance_rules"("deleted_at");
