-- REVERSE-1: track when mission became VERIFIED for reversal window
ALTER TABLE "missions" ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMPTZ;

UPDATE "missions"
SET "verified_at" = COALESCE("verified_at", "updated_at")
WHERE "status" IN ('VERIFIED', 'SETTLED') AND "verified_at" IS NULL;
