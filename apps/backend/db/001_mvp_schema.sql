-- MVP initial schema (generated from the current prisma schema).
-- Run with a user that has CREATE/ALTER privileges on the target database.

BEGIN;

DO $$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('ADMIN','COOP','EMPLOYER','DRIVER','FLEET_OWNER','HOUSEHOLD','CONSULTANT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "HouseholdStatus" AS ENUM ('PENDING','APPROVED','REJECTED','SUSPENDED','NEEDS_CORRECTION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LoadStatus" AS ENUM ('PENDING','IN_TRANSIT','DELIVERED','CANCELED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MissionStatus" AS ENUM (
    'ASSIGNED','LOADING','ON_THE_WAY','UNLOADING','COMPLETED','APPROVED','REJECTED','CANCELED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WeighbridgeTicketStatus" AS ENUM (
    'PENDING_EMPTY','EMPTY_REGISTERED','LOADED_REGISTERED','APPROVED','REJECTED','ADJUSTED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WalletType" AS ENUM ('OWNER','HOUSEHOLD','PLATFORM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TransactionType" AS ENUM ('CREDIT','DEBIT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id               BIGSERIAL PRIMARY KEY,
  mobile_number   VARCHAR(15) NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role             "UserRole" NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mines (
  id                    BIGSERIAL PRIMARY KEY,
  mine_code            VARCHAR(50) NOT NULL UNIQUE,
  name                  VARCHAR(100) NOT NULL,
  location_coordinates  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS villages (
  id          BIGSERIAL PRIMARY KEY,
  mine_id     BIGINT NOT NULL REFERENCES mines(id) ON DELETE RESTRICT,
  name        VARCHAR(100) NOT NULL,
  district    VARCHAR(100),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS villages_mine_id_idx ON villages(mine_id);

CREATE TABLE IF NOT EXISTS households (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  village_id  BIGINT NOT NULL REFERENCES villages(id) ON DELETE RESTRICT,
  head_name   VARCHAR(100) NOT NULL,
  national_id VARCHAR(10) NOT NULL UNIQUE,
  bank_iban   VARCHAR(50),
  quota_limit INT,
  status      "HouseholdStatus" NOT NULL DEFAULT 'PENDING',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fleet_owners (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  full_name   VARCHAR(100) NOT NULL,
  national_id VARCHAR(10) NOT NULL UNIQUE,
  bank_iban   VARCHAR(50),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drivers (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  full_name      VARCHAR(100) NOT NULL,
  license_number VARCHAR(50),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id             BIGSERIAL PRIMARY KEY,
  owner_id      BIGINT NOT NULL REFERENCES fleet_owners(id) ON DELETE RESTRICT,
  license_plate VARCHAR(20) NOT NULL UNIQUE,
  vehicle_type  VARCHAR(50) NOT NULL,
  capacity_tons DECIMAL(5,2) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vehicles_owner_id_idx ON vehicles(owner_id);

CREATE TABLE IF NOT EXISTS loads (
  id                BIGSERIAL PRIMARY KEY,
  load_tracking_code VARCHAR(50) NOT NULL UNIQUE,
  mine_id           BIGINT NOT NULL REFERENCES mines(id) ON DELETE RESTRICT,
  household_id     BIGINT NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
  material_type    VARCHAR(50) NOT NULL,
  status           "LoadStatus" NOT NULL DEFAULT 'PENDING',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS loads_mine_id_idx ON loads(mine_id);
CREATE INDEX IF NOT EXISTS loads_household_id_idx ON loads(household_id);

CREATE TABLE IF NOT EXISTS missions (
  id         BIGSERIAL PRIMARY KEY,
  load_id    BIGINT NOT NULL REFERENCES loads(id) ON DELETE RESTRICT,
  owner_id   BIGINT NOT NULL REFERENCES fleet_owners(id) ON DELETE RESTRICT,
  driver_id  BIGINT NOT NULL REFERENCES drivers(id) ON DELETE RESTRICT,
  vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  status     "MissionStatus" NOT NULL DEFAULT 'ASSIGNED',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS missions_load_id_idx ON missions(load_id);

CREATE TABLE IF NOT EXISTS weighbridge_tickets (
  id                  BIGSERIAL PRIMARY KEY,
  mission_id         BIGINT NOT NULL UNIQUE REFERENCES missions(id) ON DELETE RESTRICT,
  ticket_number      VARCHAR(50) NOT NULL UNIQUE,
  empty_weight       DECIMAL(10,2) NOT NULL,
  loaded_weight      DECIMAL(10,2) NOT NULL,
  net_weight         DECIMAL(10,2) NOT NULL,
  status             "WeighbridgeTicketStatus" NOT NULL DEFAULT 'PENDING_EMPTY',
  created_by_user_id BIGINT,
  approved_by_user_id BIGINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallets (
  id                 BIGSERIAL PRIMARY KEY,
  wallet_type        "WalletType" NOT NULL,
  owner_id           BIGINT,
  household_id       BIGINT,
  platform_owner_key TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallets_owner_fk FOREIGN KEY (owner_id) REFERENCES fleet_owners(id) ON DELETE RESTRICT,
  CONSTRAINT wallets_household_fk FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT,
  CONSTRAINT wallets_owner_or_household_required CHECK (
    (wallet_type = 'OWNER' AND owner_id IS NOT NULL AND household_id IS NULL) OR
    (wallet_type = 'HOUSEHOLD' AND household_id IS NOT NULL AND owner_id IS NULL) OR
    (wallet_type = 'PLATFORM' AND owner_id IS NULL AND household_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS transactions (
  id          BIGSERIAL PRIMARY KEY,
  wallet_id   BIGINT NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  mission_id  BIGINT REFERENCES missions(id) ON DELETE RESTRICT,
  amount      DECIMAL(15,2) NOT NULL,
  type        "TransactionType" NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transactions_wallet_id_idx ON transactions(wallet_id);
CREATE INDEX IF NOT EXISTS transactions_mission_id_idx ON transactions(mission_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id                    BIGSERIAL PRIMARY KEY,
  entity_type          TEXT NOT NULL,
  entity_id            TEXT NOT NULL,
  action               TEXT NOT NULL,
  before_value         JSONB,
  after_value          JSONB,
  performed_by_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
  reason               TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id);

COMMIT;

