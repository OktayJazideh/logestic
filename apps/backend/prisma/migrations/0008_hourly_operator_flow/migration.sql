-- HOURLY-1: OPERATOR role + START/END/VERIFY flow fields

DO $$ BEGIN ALTER TYPE "UserRole" ADD VALUE 'OPERATOR'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "HourlyWorkLogStatus" ADD VALUE 'STARTED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "HourlyWorkLogStatus" ADD VALUE 'ENDED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "hourly_work_logs"
  ADD COLUMN IF NOT EXISTS "mission_id" BIGINT,
  ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "ended_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "raw_hours" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "billable_hours" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "start_photo_url" TEXT,
  ADD COLUMN IF NOT EXISTS "end_photo_url" TEXT,
  ADD COLUMN IF NOT EXISTS "start_geo" JSONB,
  ADD COLUMN IF NOT EXISTS "end_geo" JSONB,
  ADD COLUMN IF NOT EXISTS "note" TEXT,
  ADD COLUMN IF NOT EXISTS "consultant_verified_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "verification_reason" TEXT;

-- Backfill from legacy columns when present
UPDATE "hourly_work_logs"
SET
  "raw_hours" = COALESCE("raw_hours", "hours"),
  "started_at" = COALESCE("started_at", "created_at"),
  "consultant_verified_at" = COALESCE("consultant_verified_at", "approved_at")
WHERE "hours" IS NOT NULL OR "approved_at" IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE "hourly_work_logs"
    ADD CONSTRAINT "hourly_work_logs_mission_id_fkey"
    FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "hourly_work_logs_mission_id_idx" ON "hourly_work_logs"("mission_id");
CREATE INDEX IF NOT EXISTS "hourly_work_logs_status_idx" ON "hourly_work_logs"("status");

ALTER TABLE "hourly_work_logs" ALTER COLUMN "hourly_rate_snapshot" DROP NOT NULL;

ALTER TABLE "hourly_work_logs" DROP COLUMN IF EXISTS "hours";
ALTER TABLE "hourly_work_logs" DROP COLUMN IF EXISTS "approved_at";
