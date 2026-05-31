import type { AuditLogStore } from "../stores/auditLogStore";
import { validateRedispatchCancel } from "../lib/missionFsm";
import * as loadsRepo from "../repositories/loadsRepository";
import * as missionsRepo from "../repositories/missionsRepository";
import * as needsRepo from "../repositories/operationNeedsRepository";
import { publishEvent } from "./eventBus";
import { resolveStrategy } from "./dispatch/dispatchRegistry";
import { loadNeedWithOperationType } from "./dispatch/loadNeed";
import type { DispatchAssignment, DispatchContext, DispatchResult } from "./dispatch/types";

export type { DispatchAssignment, DispatchResult };

export type RedispatchResult =
  | {
      ok: true;
      old_mission_id: number;
      need_id: number;
      cancelled_mission: missionsRepo.MissionRow;
      dispatch: Extract<DispatchResult, { ok: true }>;
    }
  | { ok: false; code: string; message: string; statusCode?: number };

export function parseNeedIdFromLoadTrackingCode(code: string): number | null {
  const match = /^LOAD-NEED(\d+)-/.exec(code);
  return match ? Number(match[1]) : null;
}

export async function redispatchMission(
  missionId: number,
  reason: string,
  performedByUserId: number,
  auditStore: AuditLogStore,
  needIdOverride?: number,
): Promise<RedispatchResult> {
  const mission = await missionsRepo.getMissionById(missionId);
  if (!mission) {
    return { ok: false, code: "mission_not_found", message: "Mission not found", statusCode: 404 };
  }

  const cancelCheck = validateRedispatchCancel(mission.status, "OPERATION_ADMIN");
  if (!cancelCheck.ok) {
    if (cancelCheck.reason === "mission_not_redispatchable") {
      return {
        ok: false,
        code: "mission_not_redispatchable",
        message: `Cannot redispatch mission in status ${mission.status}`,
        statusCode: 409,
      };
    }
    return {
      ok: false,
      code: "invalid_transition",
      message: `Cannot redispatch mission in status ${mission.status}`,
      statusCode: 409,
    };
  }

  const load = await loadsRepo.getLoadById(mission.load_id);
  if (!load) {
    return { ok: false, code: "load_not_found", message: "Load not found for mission", statusCode: 404 };
  }

  let needId = needIdOverride ?? parseNeedIdFromLoadTrackingCode(load.load_tracking_code);
  if (needId == null || !Number.isFinite(needId)) {
    return {
      ok: false,
      code: "need_not_derived",
      message: "Could not derive operation need from load; provide need_id",
      statusCode: 400,
    };
  }

  const need = await needsRepo.getOperationNeed(needId);
  if (!need) {
    return { ok: false, code: "need_not_found", message: "Operation need not found", statusCode: 404 };
  }
  if (need.mine_id !== mission.mine_id) {
    return { ok: false, code: "mine_mismatch", message: "Need does not belong to mission mine", statusCode: 403 };
  }

  const cancelled = await missionsRepo.updateMission(missionId, { status: "CANCELLED" });
  if (!cancelled) {
    return { ok: false, code: "cancel_failed", message: "Failed to cancel mission", statusCode: 500 };
  }

  await auditStore.record({
    entity_type: "mission",
    entity_id: String(missionId),
    action: "mission.redispatch",
    before_value: { status: mission.status, need_id: needId },
    after_value: { status: "CANCELLED", reason, old_mission_id: missionId, need_id: needId },
    performed_by_user_id: performedByUserId,
    reason,
  });

  const reopened = await needsRepo.reopenOperationNeedForRedispatch(needId);
  if (!reopened) {
    return {
      ok: false,
      code: "need_reopen_failed",
      message: "Failed to reopen operation need for redispatch",
      statusCode: 409,
    };
  }

  const dispatch = await dispatchOperationNeed(needId, performedByUserId, auditStore);
  if (!dispatch.ok) {
    return {
      ok: false,
      code: dispatch.code,
      message: dispatch.message,
      statusCode:
        dispatch.statusCode ??
        (dispatch.code === "active_mission_exists"
          ? 409
          : dispatch.code === "invalid_status"
            ? 409
            : 400),
    };
  }

  await publishEvent(
    "mission.redispatched",
    {
      reason,
      old_mission_id: missionId,
      need_id: needId,
      new_mission_ids: dispatch.assignments.map((a) => a.mission_id),
      mine_id: mission.mine_id,
    },
    { published_by: performedByUserId },
  );

  return {
    ok: true,
    old_mission_id: missionId,
    need_id: needId,
    cancelled_mission: cancelled,
    dispatch,
  };
}

/**
 * WF-QUEUE-1 queue integration point (future): when ENABLE_DISPATCH_QUEUE=true,
 * resolve driver candidates against `queue_slots(driver_id, mine_id, slot_start, slot_end, status)`
 * before strategy.dispatch(). MVP keeps round-robin in haulDispatchStrategy only — no cron/UI booking.
 */
export async function dispatchOperationNeed(
  needId: number,
  dispatchedByUserId: number,
  auditStore: AuditLogStore,
): Promise<DispatchResult> {
  const need = await loadNeedWithOperationType(needId);
  if (!need) {
    return { ok: false, code: "need_not_found", message: "Operation need not found" };
  }

  const operationTypeCode = need.operationType.code;
  if (!operationTypeCode) {
    return {
      ok: false,
      code: "missing_operation_type",
      message: "Operation need has no operation type code",
    };
  }

  let strategy;
  try {
    strategy = resolveStrategy(operationTypeCode);
  } catch {
    return {
      ok: false,
      code: "unsupported_operation_type",
      message: `No dispatch strategy registered for operation type: ${operationTypeCode}`,
    };
  }

  const ctx: DispatchContext = { needId, dispatchedByUserId, auditStore };

  if (!(await strategy.canDispatch(need, ctx))) {
    return {
      ok: false,
      code: "invalid_status",
      message: `Cannot dispatch need in status ${need.status}`,
    };
  }

  return strategy.dispatch(need, ctx);
}

export class DispatchService {
  constructor(private auditStore: AuditLogStore) {}

  async dispatchNeed(needId: number, dispatchedByUserId: number): Promise<DispatchResult> {
    return dispatchOperationNeed(needId, dispatchedByUserId, this.auditStore);
  }

  async redispatchMission(
    missionId: number,
    reason: string,
    performedByUserId: number,
    needIdOverride?: number,
  ): Promise<RedispatchResult> {
    return redispatchMission(missionId, reason, performedByUserId, this.auditStore, needIdOverride);
  }
}
