import { describe, expect, it } from "vitest";
import type { MissionPaymentState, MissionStatus } from "@prisma/client";

type Row = {
  id: number;
  status: MissionStatus;
  payment_state: MissionPaymentState;
  completed_at: Date | null;
  updated_at: Date;
};

function resolveDriverDashboardState(rows: Row[]) {
  const awaiting = rows.find((r) => r.status === "DELIVERED");
  if (awaiting) return { state: "AWAITING_WB" as const, activeId: awaiting.id };

  const active = rows.find((r) =>
    ["ASSIGNED", "ACCEPTED", "ARRIVED", "LOADED", "IN_TRANSIT"].includes(r.status),
  );
  if (active) return { state: "ACTIVE" as const, activeId: active.id };

  return { state: "IDLE" as const, activeId: undefined };
}

describe("driver dashboard state resolution", () => {
  it("prefers AWAITING_WB over ACTIVE", () => {
    const rows: Row[] = [
      { id: 1, status: "IN_TRANSIT", payment_state: "PENDING", completed_at: null, updated_at: new Date() },
      { id: 2, status: "DELIVERED", payment_state: "PENDING", completed_at: new Date(), updated_at: new Date() },
    ];
    expect(resolveDriverDashboardState(rows)).toEqual({ state: "AWAITING_WB", activeId: 2 });
  });

  it("returns ACTIVE when in-progress mission exists", () => {
    const rows: Row[] = [
      { id: 1, status: "LOADED", payment_state: "PENDING", completed_at: null, updated_at: new Date() },
    ];
    expect(resolveDriverDashboardState(rows)).toEqual({ state: "ACTIVE", activeId: 1 });
  });

  it("returns IDLE when no open missions", () => {
    const rows: Row[] = [
      { id: 1, status: "SETTLED", payment_state: "SETTLED", completed_at: new Date(), updated_at: new Date() },
    ];
    expect(resolveDriverDashboardState(rows)).toEqual({ state: "IDLE", activeId: undefined });
  });
});
