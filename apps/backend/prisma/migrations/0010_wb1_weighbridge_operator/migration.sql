-- WB-1: weighbridge operator flag, load quantity_tons, PENDING_HOLD ticket status

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_weighbridge_operator BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE loads
  ADD COLUMN IF NOT EXISTS quantity_tons DECIMAL(10, 2);

DO $$ BEGIN ALTER TYPE "WeighbridgeTicketStatus" ADD VALUE 'PENDING_HOLD'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
