/**
 * FIN-DUAL-1: admin finance summary exposes operational + community (dual economy).
 * Run 3x: npm run test:fin-dual1
 * Requires: DATABASE_URL, db:migrate, db:seed.
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { prisma } from "../src/db/prisma";

let testServer: Server | null = null;
let baseUrl = "";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function ensureTestServer(): Promise<string> {
  if (baseUrl) return baseUrl;
  await initAppContext();
  const app = createApp();
  return new Promise((resolve, reject) => {
    testServer = createServer(app);
    testServer.listen(0, "127.0.0.1", () => {
      const addr = testServer!.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Could not bind test server"));
        return;
      }
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve(baseUrl);
    });
    testServer.on("error", reject);
  });
}

async function http(path: string, init?: RequestInit) {
  const root = await ensureTestServer();
  const res = await fetch(`${root}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function selectWorkspace(token: string, mineId: number) {
  const r = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: mineId }),
  });
  if (r.status !== 200 || !r.json.success) {
    throw new Error(`workspace select failed: ${JSON.stringify(r.json)}`);
  }
}

async function loginAs(mobile: string) {
  await http("/api/auth/request-otp", { method: "POST", body: JSON.stringify({ mobile_number: mobile }) });
  const devOtp = await http(`/api/auth/__dev/otp?mobile_number=${mobile}`);
  const code = devOtp.json?.data?.otp;
  if (!code) throw new Error(`dev otp missing for ${mobile}`);
  const verify = await http("/api/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ mobile_number: mobile, otp_code: code }),
  });
  if (verify.status !== 200 || !verify.json.success) {
    throw new Error(`verify failed for ${mobile}: ${JSON.stringify(verify.json)}`);
  }
  return verify.json.data.access_token as string;
}

async function verifyOneMission(run: number): Promise<{ year: number; month: number }> {
  const qty = 8 + run * 0.1;
  const adminToken = await loginAs("09000000000");
  const driverToken = await loginAs("09000000003");
  const coopOpToken = await loginAs("09000000111");
  const coopAdminToken = await loginAs("09000000001");
  await selectWorkspace(driverToken, 1);
  await selectWorkspace(coopOpToken, 1);
  await selectWorkspace(coopAdminToken, 1);

  const seed = await http("/api/__dev/seed/demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: 1, quantity_tons: qty, material_type: "ORE" }),
  });
  assert(seed.status === 200 && seed.json.success, `run ${run}: seed failed ${JSON.stringify(seed.json)}`);
  const missionId = seed.json.data.mission.id as number;

  for (const step of ["ACCEPTED", "ARRIVED"] as const) {
    const body =
      step === "ARRIVED" ? { step, latitude: 27.0, longitude: 55.0 } : { step };
    const r = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify(body),
    });
    assert(r.status === 200, `run ${run}: step ${step} failed: ${JSON.stringify(r.json)}`);
  }

  const ticketRes = await http(`/api/driver/missions/${missionId}/ticket`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const ticketId = ticketRes.json?.data?.ticket?.id as number;
  assert(ticketId != null, `run ${run}: no weighbridge ticket`);

  const weights = await http(`/api/weighbridge/tickets/${ticketId}/weights`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopOpToken}` },
    body: JSON.stringify({ empty_weight: 10000, loaded_weight: 10000 + qty * 1000 }),
  });
  assert(weights.status === 200, `run ${run}: weights failed`);

  for (const step of ["LOADED", "IN_TRANSIT", "DELIVERED"] as const) {
    const body = step === "DELIVERED" ? { step, latitude: 27.05, longitude: 55.05 } : { step };
    const r = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify(body),
    });
    assert(r.status === 200, `run ${run}: step ${step} failed: ${JSON.stringify(r.json)}`);
  }

  const opAdminToken = await loginAs("09000000002");
  const approve = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opAdminToken}` },
  });
  assert(approve.status === 200 && approve.json.success, `run ${run}: approve failed`);

  const mission = await prisma.missions.findUnique({
    where: { id: BigInt(missionId) },
    select: { verified_at: true, community_contribution_rial: true },
  });
  assert(mission?.verified_at != null, `run ${run}: verified_at missing`);
  assert(
    mission.community_contribution_rial != null && Number(mission.community_contribution_rial) > 0,
    `run ${run}: community_contribution_rial must be set`,
  );

  const d = mission.verified_at!;
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

async function runOnce(run: number) {
  const { year, month } = await verifyOneMission(run);
  const adminToken = await loginAs("09000000000");

  const summaryRes = await http(`/api/admin/finance/summary?year=${year}&month=${month}&mine_id=1`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(summaryRes.status === 200 && summaryRes.json?.success, `run ${run}: summary failed`);
  const summary = summaryRes.json.data.summary as {
    cards: Record<string, unknown>;
    display_labels: {
      platform_service_fee: { en: string };
      restricted_community_fund: { en: string };
      operational_settlement: { en: string };
    };
    terms_fa: string;
  };
  const cards = summary.cards as {
    operational_total_rial: number;
    community_pool_contributions_rial: number;
  };
  assert(
    summary.display_labels?.platform_service_fee?.en === "Platform Service Fee",
    `run ${run}: platform_service_fee display_label`,
  );
  assert(
    summary.display_labels?.restricted_community_fund?.en === "Restricted Community Fund",
    `run ${run}: restricted_community_fund display_label`,
  );
  assert(summary.terms_fa?.includes("کارفرمای مستقیم"), `run ${run}: terms_fa`);
  assert(cards.operational_total_rial > 0, `run ${run}: operational_total_rial must be > 0`);
  assert(
    cards.community_pool_contributions_rial > 0,
    `run ${run}: community_pool_contributions_rial must be > 0`,
  );
  assert(
    typeof cards.operational_total_rial === "number" && typeof cards.community_pool_contributions_rial === "number",
    `run ${run}: dual economy fields must be numbers`,
  );

  const missionsRes = await http(`/api/admin/finance/missions?year=${year}&month=${month}&mine_id=1`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(missionsRes.status === 200 && missionsRes.json?.success, `run ${run}: missions list failed`);
  const missions = missionsRes.json.data.missions as Array<{
    operational_total_rial: number;
    community_contribution_rial: number;
    verified_net_tons: number;
  }>;
  assert(missions.length >= 1, `run ${run}: expected at least one VERIFIED mission row`);
  const latest = missions[0];
  assert(latest.operational_total_rial > 0, `run ${run}: mission operational must be > 0`);
  assert(latest.community_contribution_rial > 0, `run ${run}: mission community must be > 0`);
  assert(latest.verified_net_tons > 0, `run ${run}: mission tons must be > 0`);

  // eslint-disable-next-line no-console
  console.log(`FIN-DUAL-1 run ${run} OK`, {
    period: `${year}-${month}`,
    operational_total_rial: cards.operational_total_rial,
    community_pool_contributions_rial: cards.community_pool_contributions_rial,
    mission_rows: missions.length,
  });
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  // eslint-disable-next-line no-console
  console.log("FIN-DUAL-1: 3/3 runs passed");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (testServer) {
      await new Promise<void>((resolve) => testServer!.close(() => resolve()));
    }
    await prisma.$disconnect();
  });
