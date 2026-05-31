import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../db/prisma";
import { http, isServerUp, loginAs } from "../helpers/http";

describe("mission FSM integration", () => {
  let serverUp = false;

  beforeAll(async () => {
    serverUp = await isServerUp();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.runIf(() => serverUp)("rejects illegal skip and backward driver steps (409)", async () => {
    const adminToken = await loginAs("09000000000");
    const driverToken = await loginAs("09000000003");

    const seed = await http("/api/__dev/seed/demo", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ mine_id: 1, quantity_tons: 4.2, material_type: "ORE" }),
    });
    expect(seed.status).toBe(200);
    const missionId = seed.json.data.mission.id as number;

    const skip = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ step: "ARRIVED", latitude: 35.1, longitude: 51.1 }),
    });
    expect(skip.status).toBe(409);
    expect(skip.json.error?.code).toBe("invalid_transition");

    const accept = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ step: "ACCEPTED" }),
    });
    expect(accept.status).toBe(200);

    const backward = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ step: "ACCEPTED" }),
    });
    expect(backward.status).toBe(409);
    expect(backward.json.error?.code).toBe("invalid_transition");
  });

  it.runIf(() => serverUp)("happy-path driver steps end at VERIFIED after approve", async () => {
    const adminToken = await loginAs("09000000000");
    const driverToken = await loginAs("09000000003");
    const coopOpToken = await loginAs("09000000111");
    const coopAdminToken = await loginAs("09000000001");

    const seed = await http("/api/__dev/seed/demo", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ mine_id: 1, quantity_tons: 5.5, material_type: "ORE" }),
    });
    const missionId = seed.json.data.mission.id as number;

    const accept = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ step: "ACCEPTED" }),
    });
    expect(accept.status).toBe(200);

    const arrived = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ step: "ARRIVED", latitude: 27.0, longitude: 55.0, accuracy_m: 12 }),
    });
    expect(arrived.status).toBe(200);

    const ticketRes = await http(`/api/driver/missions/${missionId}/ticket`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    const ticketId = ticketRes.json?.data?.ticket?.id as number;

    const weights = await http(`/api/weighbridge/tickets/${ticketId}/weights`, {
      method: "POST",
      headers: { Authorization: `Bearer ${coopOpToken}` },
      body: JSON.stringify({ empty_weight: 10000, loaded_weight: 15500 }),
    });
    expect(weights.status).toBe(200);

    for (const step of ["LOADED", "IN_TRANSIT", "DELIVERED"] as const) {
      const body =
        step === "DELIVERED"
          ? { step, latitude: 27.05, longitude: 55.05, accuracy_m: 10, distance_m: 120 }
          : { step };
      const r = await http(`/api/driver/missions/${missionId}/steps`, {
        method: "POST",
        headers: { Authorization: `Bearer ${driverToken}` },
        body: JSON.stringify(body),
      });
      expect(r.status, step).toBe(200);
    }

    const opAdminToken = await loginAs("09000000002");
    const approve = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opAdminToken}` },
    });
    expect(approve.status).toBe(200);

    const row = await prisma.missions.findUnique({ where: { id: BigInt(missionId) } });
    expect(row?.status).toBe("VERIFIED");
  });
});
