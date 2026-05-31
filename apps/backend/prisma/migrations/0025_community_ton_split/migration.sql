-- COMM-TON-1: community contribution from verified tons (not % of fare)
ALTER TABLE "missions"
  ADD COLUMN IF NOT EXISTS "verified_net_tons_kg" DECIMAL(12, 3),
  ADD COLUMN IF NOT EXISTS "community_contribution_rial" DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS "community_rate_rial_per_ton" DECIMAL(15, 2);
