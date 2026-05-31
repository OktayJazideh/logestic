-- NEED-HOURLY-1: hourly operation need fields + nullable quantity_tons
ALTER TABLE "operation_needs"
  ADD COLUMN IF NOT EXISTS "equipment_type" TEXT,
  ADD COLUMN IF NOT EXISTS "location_text" TEXT,
  ADD COLUMN IF NOT EXISTS "estimated_hours" DECIMAL(10, 2);

ALTER TABLE "operation_needs" ALTER COLUMN "quantity_tons" DROP NOT NULL;
