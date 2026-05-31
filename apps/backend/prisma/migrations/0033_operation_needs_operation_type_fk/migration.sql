-- CORE-OS-1: operation_needs → operation_types (nullable FK + legacy column + backfill)

ALTER TABLE "operation_needs" ADD COLUMN IF NOT EXISTS "operation_type" TEXT NOT NULL DEFAULT 'TONNAGE';
ALTER TABLE "operation_needs" ADD COLUMN IF NOT EXISTS "operation_type_id" TEXT;

UPDATE "operation_needs" SET "operation_type_id" = (
  SELECT id FROM "operation_types" WHERE code = CASE
    WHEN "operation_type" = 'TONNAGE' THEN 'HAUL_TONNAGE'
    WHEN "operation_type" = 'HOURLY' THEN 'HOURLY_EQUIPMENT'
    ELSE 'HAUL_TONNAGE'
  END
  LIMIT 1
) WHERE "operation_type_id" IS NULL;

ALTER TABLE "operation_needs" ADD CONSTRAINT "operation_needs_operation_type_id_fkey"
  FOREIGN KEY ("operation_type_id") REFERENCES "operation_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "operation_needs_operation_type_id_idx" ON "operation_needs"("operation_type_id");
