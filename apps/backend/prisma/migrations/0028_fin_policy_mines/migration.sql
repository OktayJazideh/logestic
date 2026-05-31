-- FIN-POLICY-1: per-mine platform fee override + legacy community percent flag
ALTER TABLE "mines"
  ADD COLUMN IF NOT EXISTS "platform_fee_value" DECIMAL(8, 6),
  ADD COLUMN IF NOT EXISTS "allow_legacy_community_percent" BOOLEAN NOT NULL DEFAULT false;
