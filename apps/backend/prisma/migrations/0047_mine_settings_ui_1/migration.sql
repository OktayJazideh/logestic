-- MINE-SETTINGS-UI-1: per-mine dispatch + settings audit
ALTER TABLE "mines" ADD COLUMN IF NOT EXISTS "dispatch_mode" TEXT;

CREATE TABLE IF NOT EXISTS "mine_settings_audit" (
    "id" BIGSERIAL NOT NULL,
    "mine_id" BIGINT NOT NULL,
    "before_value" JSONB,
    "after_value" JSONB,
    "performed_by_user_id" BIGINT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mine_settings_audit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mine_settings_audit_mine_id_idx" ON "mine_settings_audit"("mine_id");
CREATE INDEX IF NOT EXISTS "mine_settings_audit_created_at_idx" ON "mine_settings_audit"("created_at");

ALTER TABLE "mine_settings_audit" DROP CONSTRAINT IF EXISTS "mine_settings_audit_mine_id_fkey";
ALTER TABLE "mine_settings_audit" ADD CONSTRAINT "mine_settings_audit_mine_id_fkey" FOREIGN KEY ("mine_id") REFERENCES "mines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
