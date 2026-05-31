import { appContext } from "../appContext";
import type { KycEntityKind } from "./kycWorkflow";

export const IBAN_AUDIT_ACTION = "iban_changed";

export async function recordIbanAudit(params: {
  entity_type: KycEntityKind;
  entity_id: number;
  before_iban: string | null | undefined;
  after_iban: string;
  performed_by_user_id: number;
  reason?: string;
}) {
  await appContext.auditStore.record({
    entity_type: params.entity_type,
    entity_id: String(params.entity_id),
    action: IBAN_AUDIT_ACTION,
    before_value: { bank_iban: params.before_iban ?? null },
    after_value: { bank_iban: params.after_iban },
    performed_by_user_id: params.performed_by_user_id,
    reason: params.reason,
  });
}
