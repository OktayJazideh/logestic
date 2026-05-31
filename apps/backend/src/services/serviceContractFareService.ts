import * as rateCardsRepo from "../repositories/rateCardsRepository";
import * as serviceContractsRepo from "../repositories/serviceContractsRepository";
import { DEFAULT_HAUL_OPERATION_TYPE } from "./financePolicyResolver";

export type TonnageFareSource =
  | "service_contract_rate_card"
  | "service_contract_base_rate"
  | "rate_card_fallback";

export type TonnageFareResult = {
  totalFare: number;
  rate: number;
  rate_card_id?: number;
  source: TonnageFareSource;
  service_contract_id?: number;
};

/** Operational fare: active service contract rate_card (or base_rate) when scoped; else legacy rate card lookup. */
export async function resolveTonnageFare(params: {
  mine_id: number;
  cooperative_id?: number;
  material_type: string;
  quantity_tons: number;
  at?: Date;
}): Promise<TonnageFareResult> {
  const at = params.at ?? new Date();

  if (params.cooperative_id != null) {
    const contract = await serviceContractsRepo.findActiveServiceContract({
      mine_id: params.mine_id,
      cooperative_id: params.cooperative_id,
      operation_type_code: DEFAULT_HAUL_OPERATION_TYPE,
      at,
    });
    if (contract) {
      if (contract.rate_card_id != null) {
        const card = await rateCardsRepo.getRateCardById(contract.rate_card_id);
        if (!card || card.status !== "ACTIVE" || card.mine_id !== params.mine_id) {
          throw new Error("contract_rate_card_invalid");
        }
        if (card.effective_from > at || (card.effective_to != null && card.effective_to <= at)) {
          throw new Error("contract_rate_card_not_valid_at");
        }
        return {
          totalFare: params.quantity_tons * card.rate,
          rate: card.rate,
          rate_card_id: card.id,
          source: "service_contract_rate_card",
          service_contract_id: contract.id,
        };
      }
      const rate = contract.base_rate_rial;
      return {
        totalFare: params.quantity_tons * rate,
        rate,
        source: "service_contract_base_rate",
        service_contract_id: contract.id,
      };
    }
  }

  const card = await rateCardsRepo.getActiveRateCard(
    params.mine_id,
    "TONNAGE",
    params.material_type,
    at,
  );
  if (!card) {
    throw new Error(`Missing rate card for ${params.material_type} mine=${params.mine_id}`);
  }
  return {
    totalFare: params.quantity_tons * card.rate,
    rate: card.rate,
    rate_card_id: card.id,
    source: "rate_card_fallback",
  };
}
