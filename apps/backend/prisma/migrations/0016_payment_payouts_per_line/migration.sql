-- Drop legacy one-payout-per-batch unique constraint (multiple payouts per batch allowed)

DROP INDEX IF EXISTS "payment_payouts_settlement_batch_id_key";
ALTER TABLE "payment_payouts" DROP CONSTRAINT IF EXISTS "payment_payouts_settlement_batch_id_key";
