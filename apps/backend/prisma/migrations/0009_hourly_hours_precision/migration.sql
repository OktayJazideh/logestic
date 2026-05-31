ALTER TABLE "hourly_work_logs"
  ALTER COLUMN "raw_hours" TYPE DECIMAL(10,6),
  ALTER COLUMN "billable_hours" TYPE DECIMAL(10,6);
