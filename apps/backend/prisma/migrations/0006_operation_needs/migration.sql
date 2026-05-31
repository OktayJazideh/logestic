-- EMP-1: employer operation needs

CREATE TYPE "OperationNeedStatus" AS ENUM ('PENDING', 'DISPATCHED', 'CANCELLED');

CREATE TABLE "operation_needs" (
    "id" BIGSERIAL NOT NULL,
    "mine_id" BIGINT NOT NULL,
    "employer_user_id" BIGINT NOT NULL,
    "village_id" BIGINT NOT NULL,
    "material_type" TEXT NOT NULL,
    "quantity_tons" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "status" "OperationNeedStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_needs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "operation_needs_mine_id_idx" ON "operation_needs"("mine_id");
CREATE INDEX "operation_needs_employer_user_id_idx" ON "operation_needs"("employer_user_id");
CREATE INDEX "operation_needs_status_idx" ON "operation_needs"("status");

ALTER TABLE "operation_needs" ADD CONSTRAINT "operation_needs_mine_id_fkey" FOREIGN KEY ("mine_id") REFERENCES "mines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operation_needs" ADD CONSTRAINT "operation_needs_employer_user_id_fkey" FOREIGN KEY ("employer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operation_needs" ADD CONSTRAINT "operation_needs_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
