/**
 * SVC-CONTRACT-1: service contracts drive community fixed rial per unit.
 * Run: npm run test:svc-contract1
 * Also run: npm run test:comm-ton1 (regression)
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { computeCommunityContribution } from "../src/repositories/financeLedgerRepository";
import * as rateCardsRepo from "../src/repositories/rateCardsRepository";
import * as serviceContractsRepo from "../src/repositories/serviceContractsRepository";
import { ruleEngine } from "../src/services/ruleEngine";
import { resolveTonnageFare } from "../src/services/serviceContractFareService";

const TONS_KG = 20_000;
const VALID_FROM = new Date("2026-01-01T00:00:00.000Z");

async function ensureRulesFallback() {
  const admin = await prisma.users.findFirst({ where: { mobile_number: "09000000000" } });
  const uid = admin ? Number(admin.id) : 1;
  const scope = { type: "GLOBAL" as const };
  await ruleEngine.setActive("community.rial_per_verified_ton", 500_000, scope, VALID_FROM, uid);
}

async function dualSignAndActivate(contractId: number, userId: number) {
  await serviceContractsRepo.updateDraftServiceContract(contractId, {
    signed_at_mine: new Date(),
    signed_at_coop: new Date(),
  });
  return serviceContractsRepo.activateServiceContract(contractId, userId);
}

async function scenarioDifferentContractsPerMine(userId: number) {
  await serviceContractsRepo.deleteContractsForMine(1);
  await serviceContractsRepo.deleteContractsForMine(2);

  const haulA = await serviceContractsRepo.createDraftServiceContract({
    mine_id: 1,
    cooperative_id: 1,
    operation_type_code: "HAUL_TONNAGE",
    unit: "TON",
    base_rate_rial: 12_000,
    fixed_community_amount_rial_per_unit: 400_000,
    valid_from: VALID_FROM,
    created_by: userId,
  });
  await dualSignAndActivate(haulA.id, userId);

  const haulB = await serviceContractsRepo.createDraftServiceContract({
    mine_id: 2,
    cooperative_id: 2,
    operation_type_code: "HAUL_TONNAGE",
    unit: "TON",
    base_rate_rial: 12_000,
    fixed_community_amount_rial_per_unit: 600_000,
    valid_from: VALID_FROM,
    created_by: userId,
  });
  await dualSignAndActivate(haulB.id, userId);

  const commMine1 = await computeCommunityContribution(TONS_KG, {
    mineId: 1,
    cooperativeId: 1,
    at: new Date("2026-05-01"),
  });
  const commMine2 = await computeCommunityContribution(TONS_KG, {
    mineId: 2,
    cooperativeId: 2,
    at: new Date("2026-05-01"),
  });

  const expected1 = 20 * 400_000;
  const expected2 = 20 * 600_000;
  if (commMine1 !== expected1 || commMine2 !== expected2) {
    throw new Error(
      `different contracts: expected ${expected1}/${expected2}, got ${commMine1}/${commMine2}`,
    );
  }
  if (commMine1 === commMine2) {
    throw new Error("community amounts must differ across service contracts");
  }

  const expectedRules = 20 * 500_000;
  const noCoop = await computeCommunityContribution(TONS_KG, { mineId: 1, at: new Date("2026-05-01") });
  if (noCoop !== expectedRules) {
    throw new Error(`without cooperativeId should fall back to rules (${expectedRules}), got ${noCoop}`);
  }

  // eslint-disable-next-line no-console
  console.log(`scenario 1 OK — mine1=${commMine1}, mine2=${commMine2}, rules fallback=${noCoop}`);
}

async function scenarioAmendment(userId: number) {
  await serviceContractsRepo.deleteContractsForMine(1);

  const v1 = await serviceContractsRepo.createDraftServiceContract({
    mine_id: 1,
    cooperative_id: 1,
    operation_type_code: "HAUL_TONNAGE",
    unit: "TON",
    base_rate_rial: 12_000,
    fixed_community_amount_rial_per_unit: 450_000,
    valid_from: VALID_FROM,
    created_by: userId,
  });
  await dualSignAndActivate(v1.id, userId);

  const amendFrom = new Date("2026-06-01T00:00:00.000Z");
  const { draft: v2Draft } = await serviceContractsRepo.amendServiceContract({
    active_id: v1.id,
    amendment_ref: "AMEND-1405-03-01",
    fixed_community_amount_rial_per_unit: 550_000,
    valid_from: amendFrom,
    performed_by_user_id: userId,
  });

  if (v2Draft.contract_version !== 2) {
    throw new Error(`expected contract_version 2, got ${v2Draft.contract_version}`);
  }
  if (v2Draft.amendment_ref !== "AMEND-1405-03-01") {
    throw new Error("amendment_ref missing on v2 draft");
  }

  const auditRows = await prisma.audit_logs.findMany({
    where: { entity_type: "service_contract", reason: "AMEND-1405-03-01" },
    orderBy: { id: "asc" },
  });
  if (auditRows.length < 2) {
    throw new Error(`expected >=2 audit rows for amendment, got ${auditRows.length}`);
  }

  await dualSignAndActivate(v2Draft.id, userId);

  const active = await serviceContractsRepo.findActiveServiceContract({
    mine_id: 1,
    cooperative_id: 1,
    operation_type_code: "HAUL_TONNAGE",
    at: new Date("2026-07-01"),
  });
  if (!active || active.contract_version !== 2 || active.fixed_community_amount_rial_per_unit !== 550_000) {
    throw new Error(`active v2 expected, got ${JSON.stringify(active)}`);
  }

  const comm = await computeCommunityContribution(TONS_KG, {
    mineId: 1,
    cooperativeId: 1,
    at: new Date("2026-07-01"),
  });
  if (comm !== 20 * 550_000) {
    throw new Error(`amended community expected ${20 * 550_000}, got ${comm}`);
  }

  const superseded = await serviceContractsRepo.getServiceContractById(v1.id);
  if (!superseded || superseded.status !== "SUPERSEDED") {
    throw new Error("v1 must be SUPERSEDED after amendment");
  }

  // eslint-disable-next-line no-console
  console.log(`scenario 2 OK — v${active.contract_version} active, audit rows=${auditRows.length}, community=${comm}`);
}

async function scenarioFareFromContractRateCard(userId: number) {
  await serviceContractsRepo.deleteContractsForMine(1);

  const rc = await rateCardsRepo.createDraftRateCard({
    mine_id: 1,
    cooperative_id: 1,
    operation_type: "TONNAGE",
    material_type: "ORE",
    unit_type: "TON",
    rate: 15_000,
    effective_from: VALID_FROM,
    created_by: userId,
  });
  await rateCardsRepo.activateRateCard(rc.id, userId);

  const draft = await serviceContractsRepo.createDraftServiceContract({
    mine_id: 1,
    cooperative_id: 1,
    operation_type_code: "HAUL_TONNAGE",
    unit: "TON",
    base_rate_rial: 9_999,
    fixed_community_amount_rial_per_unit: 400_000,
    rate_card_id: rc.id,
    valid_from: VALID_FROM,
    created_by: userId,
  });
  await dualSignAndActivate(draft.id, userId);

  const fare = await resolveTonnageFare({
    mine_id: 1,
    cooperative_id: 1,
    material_type: "ORE",
    quantity_tons: 10,
    at: new Date("2026-05-01"),
  });
  if (fare.source !== "service_contract_rate_card" || fare.rate !== 15_000 || fare.totalFare !== 150_000) {
    throw new Error(`fare from contract rate card expected 150000@15000, got ${JSON.stringify(fare)}`);
  }
  if (fare.rate_card_id !== rc.id) {
    throw new Error(`expected rate_card_id ${rc.id}, got ${fare.rate_card_id}`);
  }

  const fallback = await resolveTonnageFare({
    mine_id: 1,
    material_type: "ORE",
    quantity_tons: 10,
    at: new Date("2026-05-01"),
  });
  if (fallback.source !== "rate_card_fallback") {
    throw new Error(`without coop expected rate_card_fallback, got ${fallback.source}`);
  }

  // eslint-disable-next-line no-console
  console.log(`scenario 3 OK — contract fare=${fare.totalFare} from rate_card #${rc.id}`);
}

async function main() {
  const admin = await prisma.users.findFirst({ where: { mobile_number: "09000000000" } });
  if (!admin) throw new Error("admin user missing — run db:seed");
  const userId = Number(admin.id);

  await ensureRulesFallback();
  await scenarioDifferentContractsPerMine(userId);
  await scenarioAmendment(userId);
  await scenarioFareFromContractRateCard(userId);

  await serviceContractsRepo.deleteContractsForMine(1);
  await serviceContractsRepo.deleteContractsForMine(2);

  // eslint-disable-next-line no-console
  console.log("SVC-CONTRACT-1: all checks passed");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
