import { describe, expect, it } from "vitest";
import {
  MISSION_STATUSES,
  allLegalTransitions,
  canActorTransition,
  expectedNext,
  validateTransition,
} from "./missionFsm";

describe("missionFsm (9-state)", () => {
  it("defines expected next for all 9 states", () => {
    const chain: Record<string, string | null> = {
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
    expect(MISSION_STATUSES).toHaveLength(10);
    for (const status of MISSION_STATUSES) {
      expect(expectedNext(status)).toBe(chain[status]);
    }
  });

  it("allows all 8 single-step legal transitions with correct actor", () => {
    const legal = allLegalTransitions();
    expect(legal).toHaveLength(8);
    for (const { from, to, actor } of legal) {
      expect(expectedNext(from)).toBe(to);
      expect(canActorTransition(from, to, actor)).toBe(true);
      expect(validateTransition(from, to, actor).ok).toBe(true);
    }
  });

  it("allows OPERATION_ADMIN on DELIVERED→VERIFIED (9th legal actor path)", () => {
    expect(canActorTransition("DELIVERED", "VERIFIED", "OPERATION_ADMIN")).toBe(true);
    expect(validateTransition("DELIVERED", "VERIFIED", "OPERATION_ADMIN").ok).toBe(true);
  });

  it("rejects 2 illegal transitions", () => {
    expect(canActorTransition("ASSIGNED", "ARRIVED", "DRIVER")).toBe(false);
    expect(validateTransition("ASSIGNED", "ARRIVED", "DRIVER").ok).toBe(false);
    expect(canActorTransition("DELIVERED", "ACCEPTED", "DRIVER")).toBe(false);
    expect(validateTransition("DELIVERED", "ACCEPTED", "DRIVER").ok).toBe(false);
  });
});
