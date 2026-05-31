import type { Prisma } from "@prisma/client";

/** Mission must be VERIFIED, not payment-held/failed, and without open weighbridge HOLD. */
export function missionEligibleForSettlementWhere(): Prisma.missionsWhereInput {
  return {
    status: "VERIFIED",
    payment_state: { notIn: ["HELD", "FAILED"] },
    NOT: {
      weighbridge_tickets: {
        is: { status: "PENDING_HOLD" },
      },
    },
  };
}

export function isMissionEligibleForSettlement(mission: {
  status: string;
  payment_state: string;
  has_pending_hold_ticket?: boolean;
}): boolean {
  if (mission.status !== "VERIFIED") return false;
  if (mission.payment_state === "HELD" || mission.payment_state === "FAILED") return false;
  if (mission.has_pending_hold_ticket) return false;
  return true;
}
