import { HaulDispatchStrategy } from "./strategies/haulDispatchStrategy";
import { HourlyDispatchStrategy } from "./strategies/hourlyDispatchStrategy";
import type { DispatchStrategy } from "./types";

const strategies = new Map<string, DispatchStrategy>();

function register(strategy: DispatchStrategy) {
  strategies.set(strategy.code, strategy);
}

register(new HaulDispatchStrategy());
register(new HourlyDispatchStrategy());

export function resolveStrategy(operationTypeCode: string): DispatchStrategy {
  const strategy = strategies.get(operationTypeCode);
  if (!strategy) {
    throw new Error(`unsupported_operation_type:${operationTypeCode}`);
  }
  return strategy;
}

export function listRegisteredDispatchCodes(): string[] {
  return [...strategies.keys()];
}
