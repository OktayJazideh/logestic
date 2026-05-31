import type { ServiceContractUnit } from "@prisma/client";
import * as serviceContractsRepo from "../repositories/serviceContractsRepository";
import type { RuleContext } from "./ruleEngine";
import { ruleEngine } from "./ruleEngine";

export const DEFAULT_HAUL_OPERATION_TYPE = "HAUL_TONNAGE";

export type CommunityContributionSource = "service_contract" | "finance_rule";

export type ResolvedCommunityPolicy = {
  source: CommunityContributionSource;
  fixed_rial_per_unit: number;
  unit: ServiceContractUnit;
  operation_type_code: string;
  service_contract_id?: number;
};

/**
 * Community fixed amount: active service contract (mine + cooperative + operation) when scoped,
 * otherwise finance_rules fallback (COMM-TON-1 regression path).
 */
export async function resolveCommunityFixedRialPerUnit(
  mineId: number,
  ctx?: RuleContext & { operationTypeCode?: string },
): Promise<ResolvedCommunityPolicy> {
  const operation_type_code = ctx?.operationTypeCode ?? DEFAULT_HAUL_OPERATION_TYPE;

  if (ctx?.cooperativeId != null) {
    const contract = await serviceContractsRepo.findActiveServiceContract({
      mine_id: mineId,
      cooperative_id: ctx.cooperativeId,
      operation_type_code,
      at: ctx.at,
    });
    if (contract) {
      return {
        source: "service_contract",
        fixed_rial_per_unit: contract.fixed_community_amount_rial_per_unit,
        unit: contract.unit,
        operation_type_code: contract.operation_type_code,
        service_contract_id: contract.id,
      };
    }
  }

  const fromRules = await ruleEngine.getCommunityRialPerTon(ctx);
  return {
    source: "finance_rule",
    fixed_rial_per_unit: fromRules,
    unit: "TON",
    operation_type_code,
  };
}
