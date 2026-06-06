-- User profile: IBAN + village for admin provisioning and filtering
ALTER TABLE "users" ADD COLUMN "bank_iban" TEXT,
ADD COLUMN "village_id" BIGINT;

ALTER TABLE "user_provisioning_requests" ADD COLUMN "bank_iban" TEXT,
ADD COLUMN "village_id" BIGINT;

CREATE UNIQUE INDEX "users_bank_iban_unique"
  ON "users" ("bank_iban")
  WHERE "bank_iban" IS NOT NULL AND "bank_iban" <> '';

CREATE INDEX "users_village_id_idx" ON "users" ("village_id");
CREATE INDEX "user_provisioning_requests_village_id_idx" ON "user_provisioning_requests" ("village_id");

ALTER TABLE "users" ADD CONSTRAINT "users_village_id_fkey"
  FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_provisioning_requests" ADD CONSTRAINT "user_provisioning_requests_village_id_fkey"
  FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "upr_pending_iban_unique"
  ON "user_provisioning_requests" ("bank_iban")
  WHERE "status" = 'PENDING' AND "bank_iban" IS NOT NULL AND "bank_iban" <> '';
