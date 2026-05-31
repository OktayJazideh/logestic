/**
 * ACC-FUND-1 + PLATFORM-LEGAL-1: semantic fund tags on transactions (second layer; not TransactionType).
 * | fund_type | PLATFORM-LEGAL label |
 * | OPERATIONAL | Operational settlement (cooperative-internal) |
 * | PLATFORM_REVENUE | Platform Service Fee |
 * | COMMUNITY_RESTRICTED | Restricted Community Fund |
 */

export const FundType = {
  OPERATIONAL: "OPERATIONAL",
  PLATFORM_REVENUE: "PLATFORM_REVENUE",
  COMMUNITY_RESTRICTED: "COMMUNITY_RESTRICTED",
} as const;

export type FundType = (typeof FundType)[keyof typeof FundType];

export const LedgerLane = {
  OPERATIONAL_LEDGER: "OPERATIONAL_LEDGER",
  PLATFORM_LEDGER: "PLATFORM_LEDGER",
  COMMUNITY_LEDGER: "COMMUNITY_LEDGER",
} as const;

export type LedgerLane = (typeof LedgerLane)[keyof typeof LedgerLane];

export type TransactionFundMeta = {
  fund_type: FundType;
  ledger_lane: LedgerLane;
};

export const FUND_TAGS = {
  operational: {
    fund_type: FundType.OPERATIONAL,
    ledger_lane: LedgerLane.OPERATIONAL_LEDGER,
  },
  platformRevenue: {
    fund_type: FundType.PLATFORM_REVENUE,
    ledger_lane: LedgerLane.PLATFORM_LEDGER,
  },
  communityRestricted: {
    fund_type: FundType.COMMUNITY_RESTRICTED,
    ledger_lane: LedgerLane.COMMUNITY_LEDGER,
  },
} satisfies Record<string, TransactionFundMeta>;
