-- EVENT-1: durable domain event log for in-process bus + future QUEUE-1 / NOTIF-1
CREATE TABLE "events" (
    "id" BIGSERIAL NOT NULL,
    "event_name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "correlation_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by" BIGINT,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "events_event_name_occurred_at_idx" ON "events"("event_name", "occurred_at" DESC);
CREATE INDEX "events_correlation_id_idx" ON "events"("correlation_id");
