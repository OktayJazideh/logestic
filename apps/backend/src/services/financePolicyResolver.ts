import type { ServiceContractUnit } from "@prisma/client";
import * as serviceContractsRepo from "../repositories/serviceContractsRepository";
import { loadMineFinanceConfig } from "./mineSettingsService";
import type { RuleContext } from "./ruleEngine";

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
 * Community fixed amount from active service contract (mine + cooperative + operation).
 * @throws MineConfigIncompleteError when contract or rates are missing
 */
export async function resolveCommunityFixedRialPerUnit(
  mineId: number,
  ctx?: RuleContext & { operationTypeCode?: string },
): Promise<ResolvedCommunityPolicy> {
  const cfg = await loadMineFinanceConfig(mineId, {
    cooperative_id: ctx?.cooperativeId,
    operation_type_code: ctx?.operationTypeCode,
  });

  const contract = await serviceContractsRepo.findActiveServiceContract({
    mine_id: mineId,
    cooperative_id: cfg.cooperative_id,
    operation_type_code: cfg.operation_type_code,
    at: ctx?.at,
  });

  return {
    source: "service_contract",
    fixed_rial_per_unit: cfg.community_rial_per_ton,
    unit: contract?.unit ?? "TON",
    operation_type_code: cfg.operation_type_code,
    service_contract_id: cfg.service_contract_id,
  };
}
