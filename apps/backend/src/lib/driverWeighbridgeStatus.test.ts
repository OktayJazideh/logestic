import { describe, expect, it } from "vitest";
import { buildDriverWeighbridgeStatus } from "./driverWeighbridgeStatus";
import type { WeighbridgeTicketRow } from "../repositories/weighbridgeRepository";

function ticket(partial: Partial<WeighbridgeTicketRow> & Pick<WeighbridgeTicketRow, "status">): WeighbridgeTicketRow {
  const now = new Date();
  return {
    id: 1,
    mission_id: 10,
    ticket_number: "WB-1",
    empty_weight: 0,
    loaded_weight: 0,
    net_weight: 0,
    requires_supervisor_approve: false,
    created_at: now,
    updated_at: now,
    ...partial,
  };
}

describe("buildDriverWeighbridgeStatus", () => {
  it("returns PENDING_EMPTY when no ticket", () => {
    const s = buildDriverWeighbridgeStatus({ ticket: null, payment_state: "PENDING" });
    expect(s.ticket_status).toBe("PENDING_EMPTY");
    expect(s.net_weight_kg).toBeNull();
    expect(s.payment_hold).toBe(false);
  });

  it("exposes net only when approved", () => {
    const s = buildDriverWeighbridgeStatus({
      ticket: ticket({
        status: "LOADED_REGISTERED",
        empty_weight: 12000,
        loaded_weight: 45000,
        net_weight: 33000,
      }),
      payment_state: "PENDING",
    });
    expect(s.ticket_status).toBe("LOADED_REGISTERED");
    expect(s.empty_weight_kg).toBe(12000);
    expect(s.loaded_weight_kg).toBe(45000);
    expect(s.net_weight_kg).toBeNull();
  });

  it("sets payment_hold on PENDING_HOLD", () => {
    const s = buildDriverWeighbridgeStatus({
      ticket: ticket({
        status: "PENDING_HOLD",
        empty_weight: 1000,
        loaded_weight: 5000,
        net_weight: 4000,
        entry_source: "OPERATOR",
      }),
      payment_state: "PENDING",
    });
    expect(s.payment_hold).toBe(true);
    expect(s.hold_percent).toBe(5);
    expect(s.hold_reason).toContain("انحراف");
  });

  it("returns approved net from ticket", () => {
    const s = buildDriverWeighbridgeStatus({
      ticket: ticket({
        status: "APPROVED",
        empty_weight: 12000,
        loaded_weight: 45000,
        net_weight: 33000,
        entry_source: "AGENT",
      }),
      payment_state: "DISTRIBUTED",
    });
    expect(s.ticket_status).toBe("APPROVED");
    expect(s.net_weight_kg).toBe(33000);
    expect(s.entry_source).toBe("AGENT");
  });
});
