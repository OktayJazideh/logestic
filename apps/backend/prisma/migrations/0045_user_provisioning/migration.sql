-- CreateEnum
CREATE TYPE "ProvisioningUnitType" AS ENUM ('COOPERATIVE', 'MINE_OPS', 'PLATFORM_SUPPORT');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "national_id" TEXT,
ADD COLUMN "full_name" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_national_id_key" ON "users"("national_id");

-- CreateTable
CREATE TABLE "user_provisioning_requests" (
    "id" BIGSERIAL NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "unit_type" "ProvisioningUnitType" NOT NULL,
    "requester_user_id" BIGINT NOT NULL,
    "cooperative_id" BIGINT,
    "mine_id" BIGINT,
    "target_role" "UserRole" NOT NULL,
    "mobile_number" TEXT NOT NULL,
    "national_id" TEXT NOT NULL,
    "full_name" TEXT,
    "note" TEXT,
    "rejection_reason" TEXT,
    "reviewed_by_user_id" BIGINT,
    "reviewed_at" TIMESTAMP(3),
    "created_user_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_provisioning_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_provisioning_requests_status_idx" ON "user_provisioning_requests"("status");
CREATE INDEX "user_provisioning_requests_requester_user_id_idx" ON "user_provisioning_requests"("requester_user_id");
CREATE INDEX "user_provisioning_requests_cooperative_id_idx" ON "user_provisioning_requests"("cooperative_id");
CREATE INDEX "user_provisioning_requests_mine_id_idx" ON "user_provisioning_requests"("mine_id");
CREATE INDEX "user_provisioning_requests_mobile_number_idx" ON "user_provisioning_requests"("mobile_number");
CREATE INDEX "user_provisioning_requests_national_id_idx" ON "user_provisioning_requests"("national_id");

-- AddForeignKey
ALTER TABLE "user_provisioning_requests" ADD CONSTRAINT "user_provisioning_requests_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_provisioning_requests" ADD CONSTRAINT "user_provisioning_requests_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_provisioning_requests" ADD CONSTRAINT "user_provisioning_requests_created_user_id_fkey" FOREIGN KEY ("created_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_provisioning_requests" ADD CONSTRAINT "user_provisioning_requests_cooperative_id_fkey" FOREIGN KEY ("cooperative_id") REFERENCES "cooperatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_provisioning_requests" ADD CONSTRAINT "user_provisioning_requests_mine_id_fkey" FOREIGN KEY ("mine_id") REFERENCES "mines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
