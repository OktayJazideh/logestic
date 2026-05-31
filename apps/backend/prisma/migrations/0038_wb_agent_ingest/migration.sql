-- WB-INT-1: agent ingest idempotency (weighbridge_id, captured_at, reading_type)
CREATE TABLE "weighbridge_agent_ingests" (
  "id" BIGSERIAL NOT NULL,
  "weighbridge_id" INTEGER NOT NULL,
  "mission_id" BIGINT NOT NULL,
  "reading_type" TEXT NOT NULL,
  "weight_kg" DECIMAL(10,2) NOT NULL,
  "captured_at" TIMESTAMP(3) NOT NULL,
  "plate" TEXT,
  "signature" TEXT,
  "ticket_id" BIGINT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "weighbridge_agent_ingests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "weighbridge_agent_ingests_idem_key"
  ON "weighbridge_agent_ingests"("weighbridge_id", "captured_at", "reading_type");

CREATE INDEX "weighbridge_agent_ingests_mission_id_idx"
  ON "weighbridge_agent_ingests"("mission_id");

ALTER TABLE "weighbridge_agent_ingests"
  ADD CONSTRAINT "weighbridge_agent_ingests_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "weighbridge_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "weighbridge_agent_ingests"
  ADD CONSTRAINT "weighbridge_agent_ingests_mission_id_fkey"
  FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
