import type * as needsRepo from "../../repositories/operationNeedsRepository";
import type { AuditLogStore } from "../../stores/auditLogStore";

export type DispatchAssignment = {
  mission_id: number;
  load_id: number;
  quantity_tons: number;
  vehicle_id: number;
  driver_id: number;
  owner_id: number;
};

export type DispatchResult =
  | {
      ok: true;
      need: needsRepo.OperationNeedRow;
      assignments: DispatchAssignment[];
      events: string[];
    }
  | {
      ok: false;
      code: string;
      message: string;
      statusCode?: number;
      driver_id?: number;
      vehicle_id?: number;
    };

export type OperationNeedForDispatch = needsRepo.OperationNeedRow & {
  operationType: { code: string };
};

export type DispatchContext = {
  needId: number;
  dispatchedByUserId: number;
  auditStore: AuditLogStore;
};

export interface DispatchStrategy {
  readonly code: string;
  canDispatch(need: OperationNeedForDispatch, ctx: DispatchContext): Promise<boolean>;
  dispatch(need: OperationNeedForDispatch, ctx: DispatchContext): Promise<DispatchResult>;
}
