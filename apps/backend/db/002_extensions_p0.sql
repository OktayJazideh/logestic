-- P0 extensions: rate_cards, mission payment_state & snapshots, hourly_work_logs,
-- settlement_batches/lines, weighbridge_adjustment_requests.
-- Apply after 001_mvp_schema.sql on PostgreSQL.

BEGIN;

DO $$ BEGIN
  CREATE TYPE "MissionPaymentState" AS ENUM (
    'PENDING','CALCULATED','DISTRIBUTED','SETTLED','HELD','FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "HourlyWorkLogStatus" AS ENUM ('PENDING','APPROVED','REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SettlementBatchStatus" AS ENUM (
    'DRAFT','CALCULATED','READY_FOR_SETTLEMENT','IN_BANK_QUEUE','SETTLED','FAILED','CANCELLED','LOCKED','PAID'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommunityPoolStatus" AS ENUM ('OPEN','SNAPSHOT_LOCKED','DISTRIBUTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WeighbridgeAdjustmentStatus" AS ENUM ('PENDING','APPROVED','REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS rate_cards (
  id             BIGSERIAL PRIMARY KEY,
  mine_id        BIGINT NOT NULL REFERENCES mines(id) ON DELETE RESTRICT,
  material_type  VARCHAR(80) NOT NULL,
  rate_per_ton   DECIMAL(15,4) NOT NULL,
  valid_from     TIMESTAMPTZ NOT NULL,
  valid_to       TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rate_cards_mine_id_idx ON rate_cards(mine_id);

ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS rate_card_id BIGINT REFERENCES rate_cards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rate_per_ton_snapshot DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS payment_state "MissionPaymentState" NOT NULL DEFAULT 'PENDING';

CREATE INDEX IF NOT EXISTS missions_rate_card_id_idx ON missions(rate_card_id);

CREATE TABLE IF NOT EXISTS hourly_work_logs (
  id                   BIGSERIAL PRIMARY KEY,
  mine_id              BIGINT NOT NULL REFERENCES mines(id) ON DELETE RESTRICT,
  fleet_owner_id       BIGINT NOT NULL REFERENCES fleet_owners(id) ON DELETE RESTRICT,
  vehicle_id           BIGINT REFERENCES vehicles(id) ON DELETE SET NULL,
  hours                DECIMAL(10,2) NOT NULL,
  hourly_rate_snapshot DECIMAL(15,4) NOT NULL,
  status               "HourlyWorkLogStatus" NOT NULL DEFAULT 'PENDING',
  consultant_user_id   BIGINT,
  approved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hourly_work_logs_mine_id_idx ON hourly_work_logs(mine_id);
CREATE INDEX IF NOT EXISTS hourly_work_logs_owner_idx ON hourly_work_logs(fleet_owner_id);

CREATE TABLE IF NOT EXISTS settlement_batches (
  id                  BIGSERIAL PRIMARY KEY,
  mine_id             BIGINT REFERENCES mines(id) ON DELETE SET NULL,
  period_start        TIMESTAMPTZ NOT NULL,
  period_end          TIMESTAMPTZ NOT NULL,
  status              "SettlementBatchStatus" NOT NULL DEFAULT 'DRAFT',
  created_by_user_id  BIGINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS settlement_batches_mine_id_idx ON settlement_batches(mine_id);

CREATE TABLE IF NOT EXISTS settlement_lines (
  id          BIGSERIAL PRIMARY KEY,
  batch_id    BIGINT NOT NULL REFERENCES settlement_batches(id) ON DELETE CASCADE,
  wallet_id   BIGINT NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  amount      DECIMAL(15,2) NOT NULL,
  mission_id  BIGINT REFERENCES missions(id) ON DELETE SET NULL,
  note        TEXT
);
CREATE INDEX IF NOT EXISTS settlement_lines_batch_id_idx ON settlement_lines(batch_id);

CREATE TABLE IF NOT EXISTS community_pools (
  id                   BIGSERIAL PRIMARY KEY,
  mine_id              BIGINT REFERENCES mines(id) ON DELETE SET NULL,
  period_key           VARCHAR(16) NOT NULL,
  total_amount         DECIMAL(15,2) NOT NULL DEFAULT 0,
  status               "CommunityPoolStatus" NOT NULL DEFAULT 'OPEN',
  households_snapshot  JSONB,
  distributed_at       TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT community_pool_unique UNIQUE (mine_id, period_key)
);
CREATE INDEX IF NOT EXISTS community_pools_status_idx ON community_pools(status);

CREATE TABLE IF NOT EXISTS weighbridge_adjustment_requests (
  id                     BIGSERIAL PRIMARY KEY,
  ticket_id              BIGINT NOT NULL REFERENCES weighbridge_tickets(id) ON DELETE RESTRICT,
  mission_id             BIGINT NOT NULL REFERENCES missions(id) ON DELETE RESTRICT,
  reason                 TEXT NOT NULL,
  before_net             DECIMAL(10,2) NOT NULL,
  after_net              DECIMAL(10,2) NOT NULL,
  status                 "WeighbridgeAdjustmentStatus" NOT NULL DEFAULT 'PENDING',
  requested_by_user_id   BIGINT NOT NULL,
  approved_by_user_id    BIGINT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wba_ticket_id_idx ON weighbridge_adjustment_requests(ticket_id);
CREATE INDEX IF NOT EXISTS wba_mission_id_idx ON weighbridge_adjustment_requests(mission_id);

-- Next: apply 003_schema_p0_payment_lifecycle.sql for snapshots, hourly FKs, settlement lifecycle, payment_payouts.

COMMIT;
