import { prisma } from "../../../db/prisma";
import * as dispatchRepo from "../../../repositories/dispatchRepository";
import * as needsRepo from "../../../repositories/operationNeedsRepository";
import * as loadsRepo from "../../../repositories/loadsRepository";
import * as missionsRepo from "../../../repositories/missionsRepository";
import { publishEvent } from "../../eventBus";
import type {
  DispatchAssignment,
  DispatchContext,
  DispatchResult,
  DispatchStrategy,
  OperationNeedForDispatch,
} from "../types";

function trackingCode(needId: number, seq: number) {
  const suffix = Math.random().toString(16).slice(2, 6).toUpperCase();
  return `LOAD-NEED${needId}-${seq}-${suffix}`;
}

export class HaulDispatchStrategy implements DispatchStrategy {
  readonly code = "HAUL_TONNAGE";

  async canDispatch(need: OperationNeedForDispatch, _ctx: DispatchContext): Promise<boolean> {
    return need.status === "PENDING";
  }

  async dispatch(need: OperationNeedForDispatch, ctx: DispatchContext): Promise<DispatchResult> {
    const needId = need.id;
    const needBefore = need;

    if (needBefore.status !== "PENDING") {
      return {
        ok: false,
        code: "invalid_status",
        message: `Cannot dispatch need in status ${needBefore.status}`,
      };
    }

    const householdId = await dispatchRepo.findApprovedHouseholdForVillage(needBefore.village_id);
    if (!householdId) {
      return {
        ok: false,
        code: "no_household",
        message: "No approved household for destination village",
      };
    }

    const qtyTons = needBefore.quantity_tons;
    if (qtyTons == null || qtyTons <= 0) {
      return {
        ok: false,
        code: "invalid_haul_need",
        message: "Haul need is missing quantity_tons",
      };
    }

    const candidates = await dispatchRepo.listDispatchCandidatesForMine(needBefore.mine_id);
    let plans: dispatchRepo.MissionAssignmentPlan[];
    try {
      plans = dispatchRepo.planMissionAssignments(needId, qtyTons, candidates);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "dispatch_plan_failed";
      if (msg === "no_dispatch_candidates") {
        return { ok: false, code: "no_dispatch_candidates", message: "No approved fleet for mine" };
      }
      if (msg === "insufficient_vehicle_capacity") {
        return {
          ok: false,
          code: "insufficient_vehicle_capacity",
          message: "Approved fleet capacity is insufficient for this need",
        };
      }
      return { ok: false, code: "dispatch_plan_failed", message: msg };
    }

    const events: string[] = [];
    const assignments: DispatchAssignment[] = [];

    for (const plan of plans) {
      if (await dispatchRepo.hasActiveMissionForDriver(plan.candidate.driver_id)) {
        return {
          ok: false,
          code: "active_mission_exists",
          message: "Driver already has an active mission",
          statusCode: 409,
          driver_id: plan.candidate.driver_id,
        };
      }
      if (await dispatchRepo.hasActiveMissionForVehicle(plan.candidate.vehicle_id)) {
        return {
          ok: false,
          code: "active_mission_exists",
          message: "Vehicle already has an active mission",
          statusCode: 409,
          vehicle_id: plan.candidate.vehicle_id,
        };
      }
    }

    try {
      const updatedNeed = await prisma.$transaction(async (tx) => {
        const locked = await needsRepo.getOperationNeed(needId, tx);
        if (!locked || locked.status !== "PENDING") {
          throw new Error("need_not_pending");
        }

        let seq = 0;
        for (const plan of plans) {
          if (await dispatchRepo.hasActiveMissionForDriver(plan.candidate.driver_id, tx)) {
            throw new Error(`active_mission_exists:driver:${plan.candidate.driver_id}`);
          }
          if (await dispatchRepo.hasActiveMissionForVehicle(plan.candidate.vehicle_id, tx)) {
            throw new Error(`active_mission_exists:vehicle:${plan.candidate.vehicle_id}`);
          }

          seq += 1;
          const load = await loadsRepo.createLoad(
            {
              load_tracking_code: trackingCode(needId, seq),
              mine_id: locked.mine_id,
              household_id: householdId,
              material_type: locked.material_type,
              quantity_tons: plan.quantity_tons,
              status: "IN_TRANSIT",
            },
            tx,
          );

          const mission = await missionsRepo.createMission(
            {
              load_id: load.id,
              owner_id: plan.candidate.owner_id,
              driver_id: plan.candidate.driver_id,
              vehicle_id: plan.candidate.vehicle_id,
              material_type_snapshot: locked.material_type,
            },
            tx,
          );
          const assigned = await missionsRepo.assignMissionFromDispatch(mission.id, tx);
          if (!assigned) throw new Error("mission_assign_failed");

          assignments.push({
            mission_id: assigned.id,
            load_id: load.id,
            quantity_tons: plan.quantity_tons,
            vehicle_id: plan.candidate.vehicle_id,
            driver_id: plan.candidate.driver_id,
            owner_id: plan.candidate.owner_id,
          });

          events.push("mission.created");
          events.push("mission.assigned");
        }

        return needsRepo.markOperationNeedDispatched(needId, tx);
      });

      for (const a of assignments) {
        await publishEvent(
          "mission.created",
          {
            mission_id: a.mission_id,
            load_id: a.load_id,
            need_id: needId,
            mine_id: needBefore.mine_id,
            quantity_tons: a.quantity_tons,
          },
          { published_by: ctx.dispatchedByUserId },
        );
        await publishEvent(
          "mission.assigned",
          {
            mission_id: a.mission_id,
            driver_id: a.driver_id,
            owner_id: a.owner_id,
            vehicle_id: a.vehicle_id,
            need_id: needId,
            dispatched_by_user_id: ctx.dispatchedByUserId,
          },
          { published_by: ctx.dispatchedByUserId },
        );
      }

      await ctx.auditStore.record({
        entity_type: "operation_need",
        entity_id: String(needId),
        action: "need_dispatched",
        before_value: needBefore,
        after_value: { need: updatedNeed, assignments },
        performed_by_user_id: ctx.dispatchedByUserId,
      });

      return { ok: true, need: updatedNeed, assignments, events };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "dispatch_failed";
      if (msg === "need_not_pending") {
        return { ok: false, code: "invalid_status", message: "Need is no longer PENDING" };
      }
      const driverMatch = /^active_mission_exists:driver:(\d+)$/.exec(msg);
      if (driverMatch) {
        return {
          ok: false,
          code: "active_mission_exists",
          message: "Driver already has an active mission",
          statusCode: 409,
          driver_id: Number(driverMatch[1]),
        };
      }
      const vehicleMatch = /^active_mission_exists:vehicle:(\d+)$/.exec(msg);
      if (vehicleMatch) {
        return {
          ok: false,
          code: "active_mission_exists",
          message: "Vehicle already has an active mission",
          statusCode: 409,
          vehicle_id: Number(vehicleMatch[1]),
        };
      }
      return { ok: false, code: "dispatch_failed", message: msg };
    }
  }
}
