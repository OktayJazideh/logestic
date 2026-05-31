import type { MissionStatus } from "@prisma/client";

export const MISSION_STATUSES: MissionStatus[] = [
  "CREATED",
  "ASSIGNED",
  "ACCEPTED",
  "ARRIVED",
  "LOADED",
  "IN_TRANSIT",
  "DELIVERED",
  "VERIFIED",
  "SETTLED",
  "CANCELLED",
];

/** REDISPATCH-1 — emergency cancel + re-dispatch (ASSIGNED..IN_TRANSIT). */
export const REDISPATCH_CANCELLABLE_STATUSES: MissionStatus[] = [
  "ASSIGNED",
  "ACCEPTED",
  "ARRIVED",
  "LOADED",
  "IN_TRANSIT",
];

export const REDISPATCH_BLOCKED_STATUSES: MissionStatus[] = ["VERIFIED", "SETTLED"];

/**
 * Blocks double-assign on same driver/vehicle (DISPATCH-LOCK-1 / matrix #10).
 * Maps legacy labels: LOADING→ARRIVED, AWAITING_WB→DELIVERED.
 */
export const ACTIVE_MISSION_STATUSES: MissionStatus[] = [
  "ASSIGNED",
  "ACCEPTED",
  "ARRIVED",
  "LOADED",
  "IN_TRANSIT",
  "DELIVERED",
];

/** Next status in the happy-path chain (null = terminal). */
export const NEXT_STATUS: Record<MissionStatus, MissionStatus | null> = {
  CREATED: "ASSIGNED",
  ASSIGNED: "ACCEPTED",
  ACCEPTED: "ARRIVED",
  ARRIVED: "LOADED",
  LOADED: "IN_TRANSIT",
  IN_TRANSIT: "DELIVERED",
  DELIVERED: "VERIFIED",
  VERIFIED: "SETTLED",
  SETTLED: null,
  CANCELLED: null,
};

export type MissionTransitionActor =
  | "DISPATCH"
  | "DRIVER"
  | "COOP_ADMIN"
  | "OPERATION_ADMIN"
  | "SETTLEMENT_ENGINE";

const ACTOR_FOR_EDGE: Record<string, MissionTransitionActor> = {
  "CREATED->ASSIGNED": "DISPATCH",
  "ASSIGNED->ACCEPTED": "DRIVER",
  "ACCEPTED->ARRIVED": "DRIVER",
  "ARRIVED->LOADED": "DRIVER",
  "LOADED->IN_TRANSIT": "DRIVER",
  "IN_TRANSIT->DELIVERED": "DRIVER",
  "DELIVERED->VERIFIED": "COOP_ADMIN",
  "VERIFIED->SETTLED": "SETTLEMENT_ENGINE",
};

/** Target statuses a driver may POST via /driver/missions/:id/steps */
export const DRIVER_STEP_TARGETS = [
  "ACCEPTED",
  "ARRIVED",
  "LOADED",
  "IN_TRANSIT",
  "DELIVERED",
] as const satisfies readonly MissionStatus[];

export type DriverStepTarget = (typeof DRIVER_STEP_TARGETS)[number];

export function transitionKey(from: MissionStatus, to: MissionStatus): string {
  return `${from}->${to}`;
}

export function expectedNext(from: MissionStatus): MissionStatus | null {
  return NEXT_STATUS[from] ?? null;
}

export function actorForTransition(from: MissionStatus, to: MissionStatus): MissionTransitionActor | null {
  return ACTOR_FOR_EDGE[transitionKey(from, to)] ?? null;
}

export function isLegalTransition(from: MissionStatus, to: MissionStatus): boolean {
  return expectedNext(from) === to;
}

export function canActorTransition(
  from: MissionStatus,
  to: MissionStatus,
  actor: MissionTransitionActor,
): boolean {
  if (!isLegalTransition(from, to)) return false;
  const edgeActor = actorForTransition(from, to);
  if (!edgeActor) return false;
  if (edgeActor === actor) return true;
  if (edgeActor === "COOP_ADMIN" && (actor === "COOP_ADMIN" || actor === "OPERATION_ADMIN")) return true;
  return false;
}

export function validateTransition(
  from: MissionStatus,
  to: MissionStatus,
  actor: MissionTransitionActor,
): { ok: true } | { ok: false; reason: "invalid_transition" } {
  if (!canActorTransition(from, to, actor)) {
    return { ok: false, reason: "invalid_transition" };
  }
  return { ok: true };
}

export function canRedispatchCancel(from: MissionStatus): boolean {
  return REDISPATCH_CANCELLABLE_STATUSES.includes(from);
}

export function validateRedispatchCancel(
  from: MissionStatus,
  actor: MissionTransitionActor,
): { ok: true } | { ok: false; reason: "invalid_transition" | "mission_not_redispatchable" } {
  if (REDISPATCH_BLOCKED_STATUSES.includes(from)) {
    return { ok: false, reason: "mission_not_redispatchable" };
  }
  if (!canRedispatchCancel(from)) {
    return { ok: false, reason: "invalid_transition" };
  }
  if (actor !== "OPERATION_ADMIN") {
    return { ok: false, reason: "invalid_transition" };
  }
  return { ok: true };
}

/** All legal single-step transitions in the FSM (for tests). */
export function allLegalTransitions(): Array<{ from: MissionStatus; to: MissionStatus; actor: MissionTransitionActor }> {
  const out: Array<{ from: MissionStatus; to: MissionStatus; actor: MissionTransitionActor }> = [];
  for (const from of MISSION_STATUSES) {
    const to = expectedNext(from);
    if (!to) continue;
    const actor = actorForTransition(from, to);
    if (actor) out.push({ from, to, actor });
  }
  return out;
}
