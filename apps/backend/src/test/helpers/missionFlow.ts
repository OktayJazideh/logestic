import { http, selectCommunityMine, selectMine } from "./http";

export type VerifiedMission = {
  missionId: number;
  ticketId: number;
  ownerId: number;
  householdId: number;
  mineId: number;
  totalFare: number;
  ownerAmount: number;
  communityAmount: number;
  platformAmount: number;
};

/** devSeed → driver steps → weights → approve → VERIFIED + DISTRIBUTED */
export async function seedMissionToVerified(params: {
  adminToken: string;
  driverToken: string;
  coopOpToken: string;
  coopAdminToken: string;
  opAdminToken: string;
  quantityTons: number;
}): Promise<VerifiedMission> {
  const { adminToken, driverToken, coopOpToken, opAdminToken, quantityTons } = params;

  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: 1, quantity_tons: quantityTons, material_type: "ORE" }),
  });
  if (seed.status !== 200 || !seed.json.success) {
    throw new Error(`devSeed failed: ${JSON.stringify(seed.json)}`);
  }

  const missionId = seed.json.data.mission.id as number;
  const ownerId = seed.json.data.entities.fleetOwner.id as number;
  const householdId = seed.json.data.entities.household.id as number;
  const mineId = seed.json.data.mine_id as number;

  await selectMine(driverToken, mineId);
  await selectCommunityMine(coopOpToken, mineId, 1);
  await selectMine(opAdminToken, mineId);

  const accept = await http(`/api/driver/missions/${missionId}/steps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ step: "ACCEPTED" }),
  });
  if (accept.status !== 200) throw new Error(`ACCEPTED failed: ${JSON.stringify(accept.json)}`);

  const arrived = await http(`/api/driver/missions/${missionId}/steps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ step: "ARRIVED", latitude: 27.0, longitude: 55.0 }),
  });
  if (arrived.status !== 200) throw new Error(`ARRIVED failed: ${JSON.stringify(arrived.json)}`);

  const ticketRes = await http(`/api/driver/missions/${missionId}/ticket`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const ticketId = ticketRes.json?.data?.ticket?.id as number;
  if (!ticketId) throw new Error("ticket missing after ARRIVED");

  const loadedKg = Math.round(10000 + quantityTons * 1000);
  const weights = await http(`/api/weighbridge/tickets/${ticketId}/weights`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopOpToken}` },
    body: JSON.stringify({ empty_weight: 10000, loaded_weight: loadedKg }),
  });
  if (weights.status !== 200 || !weights.json.success) {
    throw new Error(`weights failed: ${JSON.stringify(weights.json)}`);
  }

  for (const step of ["LOADED", "IN_TRANSIT", "DELIVERED"] as const) {
    const body = step === "DELIVERED" ? { step, latitude: 27.05, longitude: 55.05 } : { step };
    const r = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify(body),
    });
    if (r.status !== 200) throw new Error(`step ${step} failed: ${JSON.stringify(r.json)}`);
  }

  const approve = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
  });
  if (approve.status !== 200 || !approve.json.success) {
    throw new Error(`approve failed: ${JSON.stringify(approve.json)}`);
  }

  const finance = approve.json.data.finance as {
    totalFare: number;
    ownerAmount: number;
    communityAmount: number;
    platformAmount: number;
  };
  return {
    missionId,
    ticketId,
    ownerId,
    householdId,
    mineId,
    totalFare: finance.totalFare,
    ownerAmount: finance.ownerAmount,
    communityAmount: finance.communityAmount,
    platformAmount: finance.platformAmount,
  };
}
