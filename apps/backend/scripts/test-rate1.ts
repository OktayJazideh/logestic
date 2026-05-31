/**
 * RATE-1: versioned rate cards — create DRAFT, activate, archive prior, fare from DB.
 * Run 3x: npm run test:rate1
 * Requires: server on TEST_BASE_URL, db:migrate, db:seed.
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { initAppContext } from "../src/lib/appInit";
import * as rateCardsRepo from "../src/repositories/rateCardsRepository";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4000";

async function http(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  return { status: res.status, json };
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

async function resetMine1Rates(adminUserId: number) {
  await prisma.rate_cards.deleteMany({ where: { mine_id: BigInt(1) } });
  const jan1 = new Date("2026-01-01T00:00:00.000Z");
  const mar1 = new Date("2026-03-01T00:00:00.000Z");
  for (const [rate, from] of [
    [11000, jan1],
    [12000, mar1],
  ] as const) {
    const d = await rateCardsRepo.createDraftRateCard({
      mine_id: 1,
      operation_type: "TONNAGE",
      material_type: "ORE",
      unit_type: "TON",
      rate,
      effective_from: from,
      created_by: adminUserId,
    });
    await rateCardsRepo.activateRateCard(d.id, adminUserId);
  }
}

async function runOnce(run: number) {
  const adminToken = await loginAs("09000000000");
  const headers = { Authorization: `Bearer ${adminToken}` };

  const adminUser = await prisma.users.findFirst({ where: { mobile_number: "09000000000" } });
  if (!adminUser) throw new Error("admin user missing");
  await resetMine1Rates(Number(adminUser.id));

  const list = await http("/api/rate-cards?mine_id=1&date=2026-05-01", { headers });
  if (list.status !== 200 || !list.json.success) {
    throw new Error(`run ${run}: list failed ${JSON.stringify(list.json)}`);
  }
  const active = list.json.data.rate_cards as Array<{ material_type: string; rate: number; status: string }>;
  const ore = active.find((c) => c.material_type === "ORE");
  if (!ore || ore.status !== "ACTIVE" || ore.rate !== 12000) {
    throw new Error(`run ${run}: expected ORE active rate 12000, got ${JSON.stringify(ore)}`);
  }

  const historical = await rateCardsRepo.getRateCardValidAt(1, "TONNAGE", "ORE", new Date("2026-02-01"));
  if (!historical || historical.rate !== 11000) {
    throw new Error(`run ${run}: expected historical ORE 11000 on 2026-02-01, got ${historical?.rate}`);
  }

  const create = await http("/api/rate-cards", {
    method: "POST",
    headers,
    body: JSON.stringify({
      mine_id: 1,
      operation_type: "TONNAGE",
      material_type: "ORE",
      unit_type: "TON",
      rate: 12500 + run,
      effective_from: "2026-05-01",
    }),
  });
  if (create.status !== 201 || !create.json.success) {
    throw new Error(`run ${run}: create draft failed ${JSON.stringify(create.json)}`);
  }
  const draftId = create.json.data.rate_card.id as number;

  const activate = await http(`/api/rate-cards/${draftId}/activate`, { method: "POST", headers, body: "{}" });
  if (activate.status !== 200 || !activate.json.success) {
    throw new Error(`run ${run}: activate failed ${JSON.stringify(activate.json)}`);
  }
  const archived = activate.json.data.archived as unknown[];
  if (!Array.isArray(archived) || archived.length < 1) {
    throw new Error(`run ${run}: expected at least one archived card`);
  }

  const audits = await prisma.audit_logs.findMany({
    where: { entity_type: "rate_card", entity_id: String(draftId) },
    orderBy: { created_at: "desc" },
  });
  if (!audits.some((a) => a.action === "ACTIVATED")) {
    throw new Error(`run ${run}: missing ACTIVATED audit for card ${draftId}`);
  }

  await initAppContext();
  const { FinanceStore } = await import("../src/stores/financeStore");
  const finance = new FinanceStore();
  const fare = await finance.computeFareTonnage(10, "ORE", 1);
  if (fare.rate !== 12500 + run) {
    throw new Error(`run ${run}: fare rate expected ${12500 + run}, got ${fare.rate}`);
  }

  // eslint-disable-next-line no-console
  console.log(`RATE-1 run ${run} OK: draft=${draftId}, archived=${archived.length}, fare_rate=${fare.rate}`);
}

async function main() {
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  // eslint-disable-next-line no-console
  console.log("RATE-1: all 3 runs passed");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
