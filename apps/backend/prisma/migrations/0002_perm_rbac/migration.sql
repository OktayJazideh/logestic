-- PERM-1: official roles, cooperative tenant scope

ALTER TYPE "UserRole" ADD VALUE 'OPERATION_ADMIN';
ALTER TYPE "UserRole" ADD VALUE 'COOP_ADMIN';
ALTER TYPE "UserRole" ADD VALUE 'COOP_OPERATOR';

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cooperative_id" BIGINT;
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "cooperative_id" BIGINT;

CREATE INDEX IF NOT EXISTS "users_cooperative_id_idx" ON "users"("cooperative_id");
CREATE INDEX IF NOT EXISTS "households_cooperative_id_idx" ON "households"("cooperative_id");

DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_cooperative_id_fkey"
    FOREIGN KEY ("cooperative_id") REFERENCES "cooperatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "households" ADD CONSTRAINT "households_cooperative_id_fkey"
    FOREIGN KEY ("cooperative_id") REFERENCES "cooperatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Legacy COOP → COOP_ADMIN: done at app startup via usersRepository.migrateLegacyCoopRoles()
-- (enum values cannot be used in the same transaction as ADD VALUE in PostgreSQL)
