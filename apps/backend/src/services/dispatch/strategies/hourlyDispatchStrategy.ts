import type { DispatchContext, DispatchResult, DispatchStrategy, OperationNeedForDispatch } from "../types";

const HOURLY_NOT_READY =
  "Hourly equipment mission assignment is not implemented yet (HOURLY-APP-1). Need is recorded as PENDING.";

export class HourlyDispatchStrategy implements DispatchStrategy {
  readonly code = "HOURLY_EQUIPMENT";

  async canDispatch(need: OperationNeedForDispatch, _ctx: DispatchContext): Promise<boolean> {
    return need.status === "PENDING";
  }

  async dispatch(): Promise<DispatchResult> {
    return {
      ok: false,
      code: "hourly_dispatch_not_implemented",
      message: HOURLY_NOT_READY,
      statusCode: 501,
    };
  }
}
