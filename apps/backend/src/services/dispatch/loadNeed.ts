import { catalogCodeFromLegacy } from "../../lib/operationTypeResolve";
import * as needsRepo from "../../repositories/operationNeedsRepository";
import * as operationTypesRepo from "../../repositories/operationTypesRepository";
import type { OperationNeedForDispatch } from "./types";

export async function loadNeedWithOperationType(needId: number): Promise<OperationNeedForDispatch | null> {
  const need = await needsRepo.getOperationNeed(needId);
  if (!need) return null;

  let code = need.operation_type_code;
  if (!code && need.operation_type_id) {
    const catalog = await operationTypesRepo.getById(need.operation_type_id);
    code = catalog?.code;
  }
  if (!code) {
    code = catalogCodeFromLegacy(need.operation_type);
  }

  return {
    ...need,
    operation_type_code: code,
    operationType: { code },
  };
}
