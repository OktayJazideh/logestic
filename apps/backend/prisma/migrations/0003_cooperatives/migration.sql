-- COOP-1 part 1: enum value + new columns (households FK in 0002_perm_rbac)
ALTER TYPE "CooperativeStatus" ADD VALUE IF NOT EXISTS 'PENDING_KYC';

ALTER TABLE "cooperatives" ADD COLUMN IF NOT EXISTS "registration_number" TEXT;
ALTER TABLE "cooperatives" ADD COLUMN IF NOT EXISTS "charter_file_url" TEXT;
ALTER TABLE "cooperatives" ADD COLUMN IF NOT EXISTS "ceo_name" TEXT;
ALTER TABLE "cooperatives" ADD COLUMN IF NOT EXISTS "board_members" JSONB;
ALTER TABLE "cooperatives" ADD COLUMN IF NOT EXISTS "activity_scope" TEXT;
ALTER TABLE "cooperatives" ADD COLUMN IF NOT EXISTS "geo_area" TEXT;
ALTER TABLE "cooperatives" ADD COLUMN IF NOT EXISTS "iban" TEXT;
