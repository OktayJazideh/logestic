-- COOP-1 part 2: migrate PENDING → PENDING_KYC (requires committed enum value)
UPDATE "cooperatives" SET "status" = 'PENDING_KYC' WHERE "status" = 'PENDING';

ALTER TABLE "cooperatives" ALTER COLUMN "status" SET DEFAULT 'PENDING_KYC';
