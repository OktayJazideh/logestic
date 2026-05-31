-- WB-MANUAL-1: manual weighbridge failover metadata + supervisor gate
CREATE TYPE "WeighbridgeManualReason" AS ENUM ('SCALE_DOWN', 'NETWORK', 'OTHER');

ALTER TABLE "weighbridge_tickets"
  ADD COLUMN "entry_source" TEXT,
  ADD COLUMN "entry_note" TEXT,
  ADD COLUMN "reason_code" "WeighbridgeManualReason",
  ADD COLUMN "requires_supervisor_approve" BOOLEAN NOT NULL DEFAULT false;
