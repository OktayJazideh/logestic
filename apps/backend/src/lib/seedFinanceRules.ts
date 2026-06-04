/**
 * Global finance_rules values for db:seed, ensureSeeded, and regression scripts.
 * Not used as runtime fallbacks in production services.
 */
export const SEED_FINANCE_RULES: Record<string, number | string> = {
  "split.owner": 0.98,
  "split.platform": 0.02,
  "community.rial_per_verified_ton": 500_000,
  "weighbridge.threshold": 0.05,
  "settlement.period_days": 30,
  "settlement.owner_period_days": 7,
  "reverse.window_hours": 72,
  "pool.remainder.target": "rounding_bucket",
};

export const SEED_RULE_KEYS = Object.keys(SEED_FINANCE_RULES) as (keyof typeof SEED_FINANCE_RULES)[];
