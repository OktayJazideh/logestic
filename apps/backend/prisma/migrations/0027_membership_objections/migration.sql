-- OBJ-DB-1: persist membership objections in Postgres

CREATE TYPE "ObjectionStatus" AS ENUM ('PENDING', 'RESOLVED');

CREATE TABLE "membership_objections" (
    "id" BIGSERIAL NOT NULL,
    "cooperative_id" BIGINT NOT NULL,
    "target_household_id" BIGINT NOT NULL,
    "reporter_user_id" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ObjectionStatus" NOT NULL DEFAULT 'PENDING',
    "resolved_by" BIGINT,
    "resolution_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_objections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "membership_objections_cooperative_id_status_idx" ON "membership_objections"("cooperative_id", "status");
CREATE INDEX "membership_objections_target_household_id_idx" ON "membership_objections"("target_household_id");

ALTER TABLE "membership_objections" ADD CONSTRAINT "membership_objections_cooperative_id_fkey" FOREIGN KEY ("cooperative_id") REFERENCES "cooperatives"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_objections" ADD CONSTRAINT "membership_objections_target_household_id_fkey" FOREIGN KEY ("target_household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_objections" ADD CONSTRAINT "membership_objections_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_objections" ADD CONSTRAINT "membership_objections_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
