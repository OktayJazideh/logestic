-- Nullable national_id on provisioning requests (optional at account level)
ALTER TABLE "user_provisioning_requests" ALTER COLUMN "national_id" DROP NOT NULL;

-- Partial unique: IBAN per entity when set
CREATE UNIQUE INDEX "households_bank_iban_unique"
  ON "households" ("bank_iban")
  WHERE "bank_iban" IS NOT NULL AND "bank_iban" <> '';

CREATE UNIQUE INDEX "fleet_owners_bank_iban_unique"
  ON "fleet_owners" ("bank_iban")
  WHERE "bank_iban" IS NOT NULL AND "bank_iban" <> '';

-- One pending provisioning request per mobile / national_id
CREATE UNIQUE INDEX "upr_pending_mobile_unique"
  ON "user_provisioning_requests" ("mobile_number")
  WHERE "status" = 'PENDING';

CREATE UNIQUE INDEX "upr_pending_national_id_unique"
  ON "user_provisioning_requests" ("national_id")
  WHERE "status" = 'PENDING' AND "national_id" IS NOT NULL;
