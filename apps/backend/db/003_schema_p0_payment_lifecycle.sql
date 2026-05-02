-- P0 follow-up: mission rate snapshot fields, hourly_work_logs FKs + household,
-- settlement batch lifecycle timestamps, settlement_lines.hourly_work_log_id,
-- payment_payouts (minimum outbound payment lifecycle vs settlement_batches).
-- Apply after 002_extensions_p0.sql on PostgreSQL.

BEGIN;

-- Rate card lookup by mine + material (current effective row chosen in app by valid_from / valid_to)
CREATE INDEX IF NOT EXISTS rate_cards_mine_material_idx ON rate_cards(mine_id, material_type);

-- Mission: material snapshot alongside rate_per_ton (defense / audit when cards change)
ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS material_type_snapshot VARCHAR(80);

-- Hourly logs: consultant approval FK + household for 13% share targeting
ALTER TABLE hourly_work_logs
  ADD COLUMN IF NOT EXISTS household_id BIGINT REFERENCES households(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE hourly_work_logs
    ADD CONSTRAINT hourly_work_logs_consultant_user_id_fkey
    FOREIGN KEY (consultant_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS hourly_work_logs_household_id_idx ON hourly_work_logs(household_id);
CREATE INDEX IF NOT EXISTS hourly_work_logs_consultant_user_id_idx ON hourly_work_logs(consultant_user_id);

-- Settlement batch state machine audit + payout reconciliation
ALTER TABLE settlement_batches
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- settlement_lines: optional hourly log when line settles hourly path
ALTER TABLE settlement_lines
  ADD COLUMN IF NOT EXISTS hourly_work_log_id BIGINT REFERENCES hourly_work_logs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS settlement_lines_hourly_work_log_id_idx ON settlement_lines(hourly_work_log_id);

DO $$ BEGIN
  CREATE TYPE "PaymentPayoutStatus" AS ENUM ('PENDING','PROCESSING','COMPLETED','FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS payment_payouts (
  id                   BIGSERIAL PRIMARY KEY,
  settlement_batch_id  BIGINT NOT NULL UNIQUE REFERENCES settlement_batches(id) ON DELETE CASCADE,
  status               "PaymentPayoutStatus" NOT NULL DEFAULT 'PENDING',
  initiated_at         TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  bank_reference       TEXT,
  failure_reason       TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_payouts_status_idx ON payment_payouts(status);

COMMIT;
