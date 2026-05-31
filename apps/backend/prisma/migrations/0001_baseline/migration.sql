-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'COOP', 'EMPLOYER', 'DRIVER', 'FLEET_OWNER', 'HOUSEHOLD', 'CONSULTANT');

-- CreateEnum
CREATE TYPE "HouseholdStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'NEEDS_CORRECTION');

-- CreateEnum
CREATE TYPE "LoadStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'DELIVERED', 'CANCELED');

-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('ASSIGNED', 'LOADING', 'ON_THE_WAY', 'UNLOADING', 'COMPLETED', 'APPROVED', 'REJECTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "WeighbridgeTicketStatus" AS ENUM ('PENDING_EMPTY', 'EMPTY_REGISTERED', 'LOADED_REGISTERED', 'APPROVED', 'REJECTED', 'ADJUSTED');

-- CreateEnum
CREATE TYPE "MissionPaymentState" AS ENUM ('PENDING', 'CALCULATED', 'DISTRIBUTED', 'SETTLED', 'HELD', 'FAILED');

-- CreateEnum
CREATE TYPE "HourlyWorkLogStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SettlementBatchStatus" AS ENUM ('DRAFT', 'LOCKED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommunityPoolStatus" AS ENUM ('OPEN', 'SNAPSHOT_LOCKED', 'DISTRIBUTED');

-- CreateEnum
CREATE TYPE "PaymentPayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "WeighbridgeAdjustmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CooperativeStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "WalletType" AS ENUM ('OWNER', 'HOUSEHOLD', 'PLATFORM');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "mobile_number" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "token" TEXT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "mine_id" BIGINT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "otps" (
    "mobile_number" TEXT NOT NULL,
    "otp_code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts_left" INTEGER NOT NULL DEFAULT 3,
    "verified_at" TIMESTAMP(3),
    "rate_window_start" TIMESTAMP(3),
    "rate_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "otps_pkey" PRIMARY KEY ("mobile_number")
);

-- CreateTable
CREATE TABLE "cooperatives" (
    "id" BIGSERIAL NOT NULL,
    "mine_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "national_id" TEXT,
    "status" "CooperativeStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cooperatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mines" (
    "id" BIGSERIAL NOT NULL,
    "mine_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location_coordinates" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_cards" (
    "id" BIGSERIAL NOT NULL,
    "mine_id" BIGINT NOT NULL,
    "material_type" TEXT NOT NULL,
    "rate_per_ton" DECIMAL(15,4) NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "villages" (
    "id" BIGSERIAL NOT NULL,
    "mine_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "district" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "villages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "households" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "village_id" BIGINT NOT NULL,
    "head_name" TEXT NOT NULL,
    "national_id" TEXT NOT NULL,
    "bank_iban" TEXT,
    "quota_limit" INTEGER,
    "status" "HouseholdStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_owners" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "full_name" TEXT NOT NULL,
    "national_id" TEXT NOT NULL,
    "bank_iban" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fleet_owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "full_name" TEXT NOT NULL,
    "license_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" BIGSERIAL NOT NULL,
    "owner_id" BIGINT NOT NULL,
    "license_plate" TEXT NOT NULL,
    "vehicle_type" TEXT NOT NULL,
    "capacity_tons" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loads" (
    "id" BIGSERIAL NOT NULL,
    "load_tracking_code" TEXT NOT NULL,
    "mine_id" BIGINT NOT NULL,
    "household_id" BIGINT NOT NULL,
    "material_type" TEXT NOT NULL,
    "status" "LoadStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "missions" (
    "id" BIGSERIAL NOT NULL,
    "load_id" BIGINT NOT NULL,
    "owner_id" BIGINT NOT NULL,
    "driver_id" BIGINT NOT NULL,
    "vehicle_id" BIGINT NOT NULL,
    "status" "MissionStatus" NOT NULL DEFAULT 'ASSIGNED',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "rate_card_id" BIGINT,
    "rate_per_ton_snapshot" DECIMAL(15,4),
    "material_type_snapshot" TEXT,
    "payment_state" "MissionPaymentState" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weighbridge_tickets" (
    "id" BIGSERIAL NOT NULL,
    "mission_id" BIGINT NOT NULL,
    "ticket_number" TEXT NOT NULL,
    "empty_weight" DECIMAL(10,2) NOT NULL,
    "loaded_weight" DECIMAL(10,2) NOT NULL,
    "net_weight" DECIMAL(10,2) NOT NULL,
    "status" "WeighbridgeTicketStatus" NOT NULL DEFAULT 'PENDING_EMPTY',
    "created_by_user_id" BIGINT,
    "approved_by_user_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weighbridge_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" BIGSERIAL NOT NULL,
    "wallet_type" "WalletType" NOT NULL,
    "owner_id" BIGINT,
    "household_id" BIGINT,
    "platform_owner_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" BIGSERIAL NOT NULL,
    "wallet_id" BIGINT NOT NULL,
    "mission_id" BIGINT,
    "amount" DECIMAL(15,2) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hourly_work_logs" (
    "id" BIGSERIAL NOT NULL,
    "mine_id" BIGINT NOT NULL,
    "fleet_owner_id" BIGINT NOT NULL,
    "vehicle_id" BIGINT,
    "household_id" BIGINT,
    "hours" DECIMAL(10,2) NOT NULL,
    "hourly_rate_snapshot" DECIMAL(15,4) NOT NULL,
    "status" "HourlyWorkLogStatus" NOT NULL DEFAULT 'PENDING',
    "consultant_user_id" BIGINT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hourly_work_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_batches" (
    "id" BIGSERIAL NOT NULL,
    "mine_id" BIGINT,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "status" "SettlementBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_user_id" BIGINT,
    "locked_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "payment_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_pools" (
    "id" BIGSERIAL NOT NULL,
    "mine_id" BIGINT,
    "period_key" TEXT NOT NULL,
    "total_amount" DECIMAL(15,2) NOT NULL,
    "status" "CommunityPoolStatus" NOT NULL DEFAULT 'OPEN',
    "households_snapshot" JSONB,
    "distributed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_lines" (
    "id" BIGSERIAL NOT NULL,
    "batch_id" BIGINT NOT NULL,
    "wallet_id" BIGINT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "mission_id" BIGINT,
    "hourly_work_log_id" BIGINT,
    "note" TEXT,

    CONSTRAINT "settlement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_payouts" (
    "id" BIGSERIAL NOT NULL,
    "settlement_batch_id" BIGINT NOT NULL,
    "status" "PaymentPayoutStatus" NOT NULL DEFAULT 'PENDING',
    "initiated_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "bank_reference" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weighbridge_adjustment_requests" (
    "id" BIGSERIAL NOT NULL,
    "ticket_id" BIGINT NOT NULL,
    "mission_id" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "before_net" DECIMAL(10,2) NOT NULL,
    "after_net" DECIMAL(10,2) NOT NULL,
    "status" "WeighbridgeAdjustmentStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by_user_id" BIGINT NOT NULL,
    "approved_by_user_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weighbridge_adjustment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before_value" JSONB,
    "after_value" JSONB,
    "performed_by_user_id" BIGINT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_mobile_number_key" ON "users"("mobile_number");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "cooperatives_national_id_key" ON "cooperatives"("national_id");

-- CreateIndex
CREATE INDEX "cooperatives_mine_id_idx" ON "cooperatives"("mine_id");

-- CreateIndex
CREATE UNIQUE INDEX "mines_mine_code_key" ON "mines"("mine_code");

-- CreateIndex
CREATE INDEX "rate_cards_mine_id_idx" ON "rate_cards"("mine_id");

-- CreateIndex
CREATE INDEX "rate_cards_mine_id_material_type_idx" ON "rate_cards"("mine_id", "material_type");

-- CreateIndex
CREATE INDEX "villages_mine_id_idx" ON "villages"("mine_id");

-- CreateIndex
CREATE UNIQUE INDEX "households_user_id_key" ON "households"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "households_national_id_key" ON "households"("national_id");

-- CreateIndex
CREATE UNIQUE INDEX "fleet_owners_user_id_key" ON "fleet_owners"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "fleet_owners_national_id_key" ON "fleet_owners"("national_id");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_user_id_key" ON "drivers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_license_plate_key" ON "vehicles"("license_plate");

-- CreateIndex
CREATE INDEX "vehicles_owner_id_idx" ON "vehicles"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "loads_load_tracking_code_key" ON "loads"("load_tracking_code");

-- CreateIndex
CREATE INDEX "loads_mine_id_idx" ON "loads"("mine_id");

-- CreateIndex
CREATE INDEX "loads_household_id_idx" ON "loads"("household_id");

-- CreateIndex
CREATE INDEX "missions_load_id_idx" ON "missions"("load_id");

-- CreateIndex
CREATE INDEX "missions_rate_card_id_idx" ON "missions"("rate_card_id");

-- CreateIndex
CREATE UNIQUE INDEX "weighbridge_tickets_mission_id_key" ON "weighbridge_tickets"("mission_id");

-- CreateIndex
CREATE UNIQUE INDEX "weighbridge_tickets_ticket_number_key" ON "weighbridge_tickets"("ticket_number");

-- CreateIndex
CREATE INDEX "transactions_wallet_id_idx" ON "transactions"("wallet_id");

-- CreateIndex
CREATE INDEX "transactions_mission_id_idx" ON "transactions"("mission_id");

-- CreateIndex
CREATE INDEX "hourly_work_logs_mine_id_idx" ON "hourly_work_logs"("mine_id");

-- CreateIndex
CREATE INDEX "hourly_work_logs_fleet_owner_id_idx" ON "hourly_work_logs"("fleet_owner_id");

-- CreateIndex
CREATE INDEX "hourly_work_logs_household_id_idx" ON "hourly_work_logs"("household_id");

-- CreateIndex
CREATE INDEX "hourly_work_logs_consultant_user_id_idx" ON "hourly_work_logs"("consultant_user_id");

-- CreateIndex
CREATE INDEX "settlement_batches_mine_id_idx" ON "settlement_batches"("mine_id");

-- CreateIndex
CREATE INDEX "community_pools_status_idx" ON "community_pools"("status");

-- CreateIndex
CREATE UNIQUE INDEX "community_pools_mine_id_period_key_key" ON "community_pools"("mine_id", "period_key");

-- CreateIndex
CREATE INDEX "settlement_lines_batch_id_idx" ON "settlement_lines"("batch_id");

-- CreateIndex
CREATE INDEX "settlement_lines_hourly_work_log_id_idx" ON "settlement_lines"("hourly_work_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_payouts_settlement_batch_id_key" ON "payment_payouts"("settlement_batch_id");

-- CreateIndex
CREATE INDEX "payment_payouts_status_idx" ON "payment_payouts"("status");

-- CreateIndex
CREATE INDEX "weighbridge_adjustment_requests_ticket_id_idx" ON "weighbridge_adjustment_requests"("ticket_id");

-- CreateIndex
CREATE INDEX "weighbridge_adjustment_requests_mission_id_idx" ON "weighbridge_adjustment_requests"("mission_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooperatives" ADD CONSTRAINT "cooperatives_mine_id_fkey" FOREIGN KEY ("mine_id") REFERENCES "mines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_mine_id_fkey" FOREIGN KEY ("mine_id") REFERENCES "mines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "villages" ADD CONSTRAINT "villages_mine_id_fkey" FOREIGN KEY ("mine_id") REFERENCES "mines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_owners" ADD CONSTRAINT "fleet_owners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "fleet_owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loads" ADD CONSTRAINT "loads_mine_id_fkey" FOREIGN KEY ("mine_id") REFERENCES "mines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loads" ADD CONSTRAINT "loads_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "fleet_owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_rate_card_id_fkey" FOREIGN KEY ("rate_card_id") REFERENCES "rate_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighbridge_tickets" ADD CONSTRAINT "weighbridge_tickets_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "fleet_owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hourly_work_logs" ADD CONSTRAINT "hourly_work_logs_mine_id_fkey" FOREIGN KEY ("mine_id") REFERENCES "mines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hourly_work_logs" ADD CONSTRAINT "hourly_work_logs_fleet_owner_id_fkey" FOREIGN KEY ("fleet_owner_id") REFERENCES "fleet_owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hourly_work_logs" ADD CONSTRAINT "hourly_work_logs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hourly_work_logs" ADD CONSTRAINT "hourly_work_logs_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hourly_work_logs" ADD CONSTRAINT "hourly_work_logs_consultant_user_id_fkey" FOREIGN KEY ("consultant_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_batches" ADD CONSTRAINT "settlement_batches_mine_id_fkey" FOREIGN KEY ("mine_id") REFERENCES "mines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_pools" ADD CONSTRAINT "community_pools_mine_id_fkey" FOREIGN KEY ("mine_id") REFERENCES "mines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "settlement_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_hourly_work_log_id_fkey" FOREIGN KEY ("hourly_work_log_id") REFERENCES "hourly_work_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_payouts" ADD CONSTRAINT "payment_payouts_settlement_batch_id_fkey" FOREIGN KEY ("settlement_batch_id") REFERENCES "settlement_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighbridge_adjustment_requests" ADD CONSTRAINT "weighbridge_adjustment_requests_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "weighbridge_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighbridge_adjustment_requests" ADD CONSTRAINT "weighbridge_adjustment_requests_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
