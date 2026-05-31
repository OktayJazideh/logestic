/** CORE-OS-1: pipeline metadata contract (read from operation_types join — full wiring in later phases). */

export type VerificationKind = "WEIGHBRIDGE" | "HOURLY_LOG" | string;
export type PricingKind = "RATE_CARD_TONNAGE" | "HOURLY" | string;
export type SettlementKind = "OPERATIONAL_PLUS_COMMUNITY_TON" | "HOURLY_ONLY" | string;

export interface OperationPipelineMeta {
  verification_kind: VerificationKind;
  pricing_kind: PricingKind;
  settlement_kind: SettlementKind;
}

export function pipelineMetaFromCatalog(row: {
  verification_kind: string;
  pricing_kind: string;
  settlement_kind: string;
}): OperationPipelineMeta {
  return {
    verification_kind: row.verification_kind,
    pricing_kind: row.pricing_kind,
    settlement_kind: row.settlement_kind,
  };
}
