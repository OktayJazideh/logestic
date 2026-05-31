-- HH-KYC-COMMITTEE-1: configurable household approval quorum per cooperative

ALTER TABLE "cooperatives" ADD COLUMN "settings_json" JSONB;

CREATE TABLE "household_approvals" (
    "id" BIGSERIAL NOT NULL,
    "household_id" BIGINT NOT NULL,
    "approver_user_id" BIGINT NOT NULL,
    "role" VARCHAR(32) NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "household_approvals_household_id_approver_user_id_key" ON "household_approvals"("household_id", "approver_user_id");
CREATE INDEX "household_approvals_household_id_idx" ON "household_approvals"("household_id");

ALTER TABLE "household_approvals" ADD CONSTRAINT "household_approvals_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "household_approvals" ADD CONSTRAINT "household_approvals_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
