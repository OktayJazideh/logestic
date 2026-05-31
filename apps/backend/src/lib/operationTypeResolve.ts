import { ApiError } from "../http/errors";
import * as operationTypesRepo from "../repositories/operationTypesRepository";

export type LegacyOperationType = "TONNAGE" | "HOURLY";

export function catalogCodeFromLegacy(legacy: string): string {
  if (legacy === "HOURLY") return "HOURLY_EQUIPMENT";
  return "HAUL_TONNAGE";
}

export function legacyFromCatalogCode(code: string): LegacyOperationType {
  if (code === "HOURLY_EQUIPMENT") return "HOURLY";
  return "TONNAGE";
}

export async function resolveOperationTypeDualWrite(input: {
  operation_type_id?: string;
  operation_type?: LegacyOperationType;
}): Promise<{ operation_type_id: string; operation_type: LegacyOperationType; catalog: operationTypesRepo.OperationTypeRow }> {
  if (input.operation_type_id) {
    const catalog = await operationTypesRepo.getById(input.operation_type_id);
    if (!catalog || !catalog.is_active) {
      throw new ApiError({
        statusCode: 400,
        code: "invalid_operation_type",
        message: `Unknown or inactive operation type id: ${input.operation_type_id}`,
      });
    }
    const legacy = legacyFromCatalogCode(catalog.code);
    if (input.operation_type && input.operation_type !== legacy) {
      throw new ApiError({
        statusCode: 400,
        code: "operation_type_mismatch",
        message: `operation_type ${input.operation_type} does not match catalog code ${catalog.code}`,
      });
    }
    return { operation_type_id: catalog.id, operation_type: legacy, catalog };
  }

  const legacy: LegacyOperationType = input.operation_type ?? "TONNAGE";
  const catalog = await operationTypesRepo.assertCodeExists(catalogCodeFromLegacy(legacy));
  return { operation_type_id: catalog.id, operation_type: legacy, catalog };
}
