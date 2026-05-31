import { AsyncLocalStorage } from "node:async_hooks";

/** Prisma model delegate names (snake_case table models). */
export const SOFT_DELETE_MODELS = [
  "users",
  "households",
  "drivers",
  "vehicles",
  "fleet_owners",
  "cooperatives",
  "rate_cards",
  "operation_needs",
  "finance_rules",
] as const;

export type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number];

/** API / audit entity_type → Prisma model. */
export const MODEL_TO_AUDIT_ENTITY: Record<SoftDeleteModel, string> = {
  users: "user",
  households: "household",
  drivers: "driver",
  vehicles: "vehicle",
  fleet_owners: "fleet_owner",
  cooperatives: "cooperative",
  rate_cards: "rate_card",
  operation_needs: "operation_need",
  finance_rules: "finance_rule",
};

export const ENTITY_TYPE_TO_MODEL: Record<string, SoftDeleteModel> = {
  user: "users",
  users: "users",
  household: "households",
  households: "households",
  driver: "drivers",
  drivers: "drivers",
  vehicle: "vehicles",
  vehicles: "vehicles",
  fleet_owner: "fleet_owners",
  fleet_owners: "fleet_owners",
  cooperative: "cooperatives",
  cooperatives: "cooperatives",
  rate_card: "rate_cards",
  rate_cards: "rate_cards",
  operation_need: "operation_needs",
  operation_needs: "operation_needs",
  finance_rule: "finance_rules",
  finance_rules: "finance_rules",
};

const bypassStorage = new AsyncLocalStorage<boolean>();

export function isSoftDeleteBypassed(): boolean {
  return bypassStorage.getStore() === true;
}

export function runWithSoftDeleteBypass<T>(fn: () => T | Promise<T>): Promise<T> {
  return bypassStorage.run(true, async () => {
    const result = fn();
    return result instanceof Promise ? await result : result;
  });
}

export function isSoftDeleteModel(model: string): model is SoftDeleteModel {
  return (SOFT_DELETE_MODELS as readonly string[]).includes(model);
}

export function resolveSoftDeleteModel(entityType: string): SoftDeleteModel | null {
  const key = entityType.trim().toLowerCase();
  return ENTITY_TYPE_TO_MODEL[key] ?? null;
}

export function mergeDeletedAtFilter(
  where: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (isSoftDeleteBypassed()) {
    return where ?? {};
  }
  const base = where ?? {};
  if (Object.prototype.hasOwnProperty.call(base, "deleted_at")) {
    return base;
  }
  return { ...base, deleted_at: null };
}
