import { getWeighbridgeAnomalyThreshold } from "../services/ruleEngine";



export function computeWeighbridgeDeviation(params: {

  empty_weight: number;

  loaded_weight: number;

  quantity_tons: number;

}): { expectedKg: number; actualKg: number; deviationRatio: number | null } {

  const expectedKg = params.quantity_tons * 1000;

  const actualKg = params.loaded_weight - params.empty_weight;

  if (expectedKg <= 0) {

    return { expectedKg, actualKg, deviationRatio: null };

  }

  const deviationRatio = Math.abs(actualKg - expectedKg) / expectedKg;

  return { expectedKg, actualKg, deviationRatio };

}



export async function isWeighbridgeAnomaly(params: {

  empty_weight: number;

  loaded_weight: number;

  quantity_tons: number;

  mineId?: number;

}): Promise<{

  anomaly: boolean;

  threshold: number;

  deviationRatio: number | null;

  expectedKg: number;

  actualKg: number;

}> {

  const threshold = await getWeighbridgeAnomalyThreshold({ mineId: params.mineId });

  const { expectedKg, actualKg, deviationRatio } = computeWeighbridgeDeviation(params);

  const anomaly = deviationRatio != null && deviationRatio >= threshold;

  return { anomaly, threshold, deviationRatio, expectedKg, actualKg };

}


