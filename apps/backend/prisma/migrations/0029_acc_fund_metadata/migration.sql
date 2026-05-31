-- ACC-FUND-1: fund_type + ledger_lane on transactions (nullable; backfill existing rows)

CREATE TYPE "FundType" AS ENUM ('OPERATIONAL', 'PLATFORM_REVENUE', 'COMMUNITY_RESTRICTED');
CREATE TYPE "LedgerLane" AS ENUM ('OPERATIONAL_LEDGER', 'PLATFORM_LEDGER', 'COMMUNITY_LEDGER');

ALTER TABLE "transactions" ADD COLUMN "fund_type" "FundType";
ALTER TABLE "transactions" ADD COLUMN "ledger_lane" "LedgerLane";

CREATE INDEX "transactions_wallet_id_fund_type_idx" ON "transactions"("wallet_id", "fund_type");

-- Owner wallet: operational split credits/debits
UPDATE "transactions" t
SET "fund_type" = 'OPERATIONAL', "ledger_lane" = 'OPERATIONAL_LEDGER'
FROM "wallets" w
WHERE t."wallet_id" = w."id"
  AND w."wallet_type" = 'OWNER'
  AND t."fund_type" IS NULL
  AND (
    t."description" LIKE 'OPERATIONAL_SPLIT:%'
    OR (t."mission_id" IS NOT NULL AND t."type" IN ('CREDIT', 'DEBIT'))
  );

-- Platform wallet: platform service fee from operational split
UPDATE "transactions" t
SET "fund_type" = 'PLATFORM_REVENUE', "ledger_lane" = 'PLATFORM_LEDGER'
FROM "wallets" w
WHERE t."wallet_id" = w."id"
  AND w."wallet_type" = 'PLATFORM'
  AND t."fund_type" IS NULL
  AND (
    t."description" LIKE 'OPERATIONAL_SPLIT:PLATFORM%'
    OR t."description" LIKE 'OPERATIONAL_SPLIT:HOURLY_PLATFORM%'
  );

-- Community pool distributions and pool-linked rows
UPDATE "transactions"
SET "fund_type" = 'COMMUNITY_RESTRICTED', "ledger_lane" = 'COMMUNITY_LEDGER'
WHERE "fund_type" IS NULL
  AND (
    "type" = 'POOL_DISTRIBUTION'
    OR "community_pool_id" IS NOT NULL
  );

-- Household wallet credits from pool
UPDATE "transactions" t
SET "fund_type" = 'COMMUNITY_RESTRICTED', "ledger_lane" = 'COMMUNITY_LEDGER'
FROM "wallets" w
WHERE t."wallet_id" = w."id"
  AND w."wallet_type" = 'HOUSEHOLD'
  AND t."fund_type" IS NULL;
