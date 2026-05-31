-- HOURLY-REJ-1: consultant reject hourly work log (no finance split)
ALTER TABLE "hourly_work_logs"
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejected_by_user_id" BIGINT;

ALTER TABLE "hourly_work_logs"
  ADD CONSTRAINT "hourly_work_logs_rejected_by_user_id_fkey"
  FOREIGN KEY ("rejected_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "hourly_work_logs_rejected_by_user_id_idx" ON "hourly_work_logs"("rejected_by_user_id");
