-- SVC-CONTRACT-1: per-mine service contracts with fixed community amount per unit

CREATE TYPE "ServiceContractUnit" AS ENUM ('TON', 'LITER', 'HOUR', 'COUNT');
CREATE TYPE "ServiceContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED');

CREATE TABLE "service_contracts" (
    "id" BIGSERIAL NOT NULL,
    "mine_id" BIGINT NOT NULL,
    "cooperative_id" BIGINT NOT NULL,
    "operation_type_code" TEXT NOT NULL,
    "unit" "ServiceContractUnit" NOT NULL,
    "base_rate_rial" DECIMAL(15,2) NOT NULL,
    "fixed_community_amount_rial_per_unit" DECIMAL(15,2) NOT NULL,
    "rate_card_id" BIGINT,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "contract_version" INTEGER NOT NULL DEFAULT 1,
    "amendment_ref" TEXT,
    "status" "ServiceContractStatus" NOT NULL DEFAULT 'DRAFT',
    "signed_at_mine" TIMESTAMP(3),
    "signed_at_coop" TIMESTAMP(3),
    "created_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_contracts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "service_contracts_mine_id_operation_type_code_status_idx"
  ON "service_contracts"("mine_id", "operation_type_code", "status");
CREATE INDEX "service_contracts_cooperative_id_idx" ON "service_contracts"("cooperative_id");
CREATE INDEX "service_contracts_rate_card_id_idx" ON "service_contracts"("rate_card_id");

CREATE UNIQUE INDEX "service_contracts_one_active_per_mine_operation"
  ON "service_contracts" ("mine_id", "operation_type_code")
  WHERE status = 'ACTIVE';

ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_mine_id_fkey"
  FOREIGN KEY ("mine_id") REFERENCES "mines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_cooperative_id_fkey"
  FOREIGN KEY ("cooperative_id") REFERENCES "cooperatives"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_rate_card_id_fkey"
  FOREIGN KEY ("rate_card_id") REFERENCES "rate_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
