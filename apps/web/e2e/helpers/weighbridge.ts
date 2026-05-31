import type { APIRequestContext } from "@playwright/test";
import { apiBase, loginApi, selectWorkspace } from "./api";

/** Seed demo mission and advance driver to ARRIVED so weighbridge ticket exists. */
export async function seedMissionWithTicket(
  request: APIRequestContext,
  opts?: { mineId?: number; quantityTons?: number },
): Promise<{ missionId: number; ticketId: number }> {
  const mineId = opts?.mineId ?? 1;
  const adminToken = await loginApi(request, "09000000000");
  const driverToken = await loginApi(request, "09000000003");

  const seed = await request.post(`${apiBase}/api/__dev/seed/demo`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: {
      mine_id: mineId,
      quantity_tons: opts?.quantityTons ?? 5.5,
      material_type: "ORE",
    },
  });
  const seedJson = (await seed.json()) as {
    success?: boolean;
    data?: { mission?: { id: number } };
  };
  if (!seed.ok() || !seedJson.success || !seedJson.data?.mission?.id) {
    throw new Error(`dev seed failed: ${JSON.stringify(seedJson)}`);
  }
  const missionId = seedJson.data.mission.id;

  for (const step of ["ACCEPTED", "ARRIVED"] as const) {
    const body =
      step === "ARRIVED"
        ? { step, latitude: 27.0, longitude: 55.0 }
        : { step };
    const r = await request.post(`${apiBase}/api/driver/missions/${missionId}/steps`, {
      headers: { Authorization: `Bearer ${driverToken}`, "Idempotency-Key": crypto.randomUUID() },
      data: body,
    });
    const j = (await r.json()) as { success?: boolean };
    if (!r.ok() || !j.success) throw new Error(`driver step ${step} failed`);
  }

  const ticketRes = await request.get(`${apiBase}/api/driver/missions/${missionId}/ticket`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const ticketJson = (await ticketRes.json()) as { data?: { ticket?: { id: number } } };
  const ticketId = ticketJson.data?.ticket?.id;
  if (!ticketId) throw new Error("ticket missing after ARRIVED");

  return { missionId, ticketId };
}

export async function advanceDriverToDelivered(request: APIRequestContext, missionId: number) {
  const driverToken = await loginApi(request, "09000000003");
  for (const step of ["LOADED", "IN_TRANSIT", "DELIVERED"] as const) {
    const body = step === "DELIVERED" ? { step, latitude: 27.05, longitude: 55.05 } : { step };
    const r = await request.post(`${apiBase}/api/driver/missions/${missionId}/steps`, {
      headers: { Authorization: `Bearer ${driverToken}`, "Idempotency-Key": crypto.randomUUID() },
      data: body,
    });
    const j = (await r.json()) as { success?: boolean };
    if (!r.ok() || !j.success) throw new Error(`driver step ${step} failed`);
  }
}

export async function selectMineForCoopOperator(request: APIRequestContext, mineId = 1) {
  const token = await loginApi(request, "09000000111");
  await selectWorkspace(request, token, mineId, { cooperativeId: 1 });
  return token;
}
