-- COOP-2: KYC status + cooperative scope + document URLs for drivers, fleet_owners, vehicles

CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'NEEDS_CORRECTION');

ALTER TABLE "drivers"
  ADD COLUMN IF NOT EXISTS "cooperative_id" BIGINT,
  ADD COLUMN IF NOT EXISTS "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "license_file_url" TEXT,
  ADD COLUMN IF NOT EXISTS "identity_file_url" TEXT;

ALTER TABLE "fleet_owners"
  ADD COLUMN IF NOT EXISTS "cooperative_id" BIGINT,
  ADD COLUMN IF NOT EXISTS "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "ownership_doc_url" TEXT,
  ADD COLUMN IF NOT EXISTS "insurance_doc_url" TEXT;

ALTER TABLE "vehicles"
  ADD COLUMN IF NOT EXISTS "cooperative_id" BIGINT,
  ADD COLUMN IF NOT EXISTS "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "ownership_doc_url" TEXT,
  ADD COLUMN IF NOT EXISTS "insurance_doc_url" TEXT;

UPDATE "drivers" SET "status" = 'APPROVED' WHERE "status" = 'PENDING';
UPDATE "fleet_owners" SET "status" = 'APPROVED' WHERE "status" = 'PENDING';
UPDATE "vehicles" SET "status" = 'APPROVED' WHERE "status" = 'PENDING';

CREATE INDEX IF NOT EXISTS "drivers_cooperative_id_idx" ON "drivers"("cooperative_id");
CREATE INDEX IF NOT EXISTS "fleet_owners_cooperative_id_idx" ON "fleet_owners"("cooperative_id");
CREATE INDEX IF NOT EXISTS "vehicles_cooperative_id_idx" ON "vehicles"("cooperative_id");

DO $$ BEGIN
  ALTER TABLE "drivers" ADD CONSTRAINT "drivers_cooperative_id_fkey"
    FOREIGN KEY ("cooperative_id") REFERENCES "cooperatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "fleet_owners" ADD CONSTRAINT "fleet_owners_cooperative_id_fkey"
    FOREIGN KEY ("cooperative_id") REFERENCES "cooperatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_cooperative_id_fkey"
    FOREIGN KEY ("cooperative_id") REFERENCES "cooperatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
