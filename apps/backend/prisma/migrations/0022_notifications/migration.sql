-- NOTIF-1: in-app notifications + user channel preferences

CREATE TABLE "notifications" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "channel" VARCHAR(16) NOT NULL,
    "event_name" VARCHAR(64),
    "title" VARCHAR(256),
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "delivery_status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_preferences" (
    "user_id" BIGINT NOT NULL,
    "in_app" BOOLEAN NOT NULL DEFAULT true,
    "sms" BOOLEAN NOT NULL DEFAULT true,
    "push" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at" DESC);
CREATE INDEX "notifications_user_id_channel_created_at_idx" ON "notifications"("user_id", "channel", "created_at" DESC);

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
