/**
 * CONTRACT-VERSION-UI-1: new-version API + version list + mission rate_card_id snapshot.
 * Run: npm run test:contract-version-ui1
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import * as rateCardsRepo from "../src/repositories/rateCardsRepository";
import * as serviceContractsRepo from "../src/repositories/serviceContractsRepository";
import { toBig } from "../src/repositories/id";

const VALID_FROM = new Date("2026-01-01T00:00:00.000Z");

async function dualSignAndActivate(contractId: number, userId: number) {
  await serviceContractsRepo.updateDraftServiceContract(contractId, {
    signed_at_mine: new Date(),
    signed_at_coop: new Date(),
  });
  return serviceContractsRepo.activateServiceContract(contractId, userId);
}

async function scenarioNewVersionKeepsActiveUntilActivate(userId: number) {
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

  const activeBefore = await serviceContractsRepo.getServiceContractById(v1.id);
  if (!activeBefore || activeBefore.status !== "ACTIVE") {
    throw new Error("v1 must be ACTIVE");
  }

  const amendFrom = new Date("2026-06-15T00:00:00.000Z");
  const { draft: v2Draft, previous_active_adjusted } =
    await serviceContractsRepo.createNewServiceContractVersion({
      source_id: v1.id,
      amendment_ref: "AMEND-UI-1405-03",
      valid_from: amendFrom,
      base_rate_rial: 13_000,
      fixed_community_amount_rial_per_unit: 560_000,
      performed_by_user_id: userId,
    });

  if (v2Draft.contract_version !== 2) {
    throw new Error(`expected contract_version 2, got ${v2Draft.contract_version}`);
  }
  if (v2Draft.status !== "DRAFT") {
    throw new Error("new version must be DRAFT");
  }

  const activeAfter = await serviceContractsRepo.getServiceContractById(v1.id);
  if (!activeAfter || activeAfter.status !== "ACTIVE") {
    throw new Error("v1 must remain ACTIVE until new version is activated");
  }
  if (previous_active_adjusted != null) {
    throw new Error("future valid_from should not adjust ACTIVE valid_to");
  }

  const versions = await serviceContractsRepo.listServiceContractVersions({
    mine_id: 1,
    cooperative_id: 1,
    operation_type_code: "HAUL_TONNAGE",
  });
  if (versions.length !== 2) {
    throw new Error(`expected 2 versions, got ${versions.length}`);
  }
  const display = versions.map((v) => serviceContractsRepo.displayContractStatus(v, new Date("2026-05-01")));
  if (!display.includes("ACTIVE") || !display.includes("DRAFT")) {
    throw new Error(`expected ACTIVE+DRAFT badges, got ${display.join(",")}`);
  }

  await dualSignAndActivate(v2Draft.id, userId);
  const activeV2 = await serviceContractsRepo.findActiveServiceContract({
    mine_id: 1,
    cooperative_id: 1,
    operation_type_code: "HAUL_TONNAGE",
    at: new Date("2026-07-01"),
  });
  if (!activeV2 || activeV2.contract_version !== 2) {
    throw new Error("v2 must be active after activation");
  }

  const superseded = await serviceContractsRepo.getServiceContractById(v1.id);
  if (!superseded || superseded.status !== "SUPERSEDED") {
    throw new Error("v1 must be SUPERSEDED after v2 activation");
  }

  // eslint-disable-next-line no-console
  console.log("scenario 1 OK — new-version DRAFT without immediate supersede; list + activate");
}

async function scenarioOverlapSetsValidToNow(userId: number) {
  await serviceContractsRepo.deleteContractsForMine(1);

  const v1 = await serviceContractsRepo.createDraftServiceContract({
    mine_id: 1,
    cooperative_id: 1,
    operation_type_code: "HAUL_TONNAGE",
    unit: "TON",
    base_rate_rial: 12_000,
    fixed_community_amount_rial_per_unit: 400_000,
    valid_from: VALID_FROM,
    created_by: userId,
  });
  await dualSignAndActivate(v1.id, userId);

  const now = new Date();
  const { previous_active_adjusted } = await serviceContractsRepo.createNewServiceContractVersion({
    source_id: v1.id,
    amendment_ref: "AMEND-OVERLAP-NOW",
    valid_from: now,
    base_rate_rial: 12_500,
    fixed_community_amount_rial_per_unit: 480_000,
    performed_by_user_id: userId,
  });

  if (!previous_active_adjusted?.valid_to) {
    throw new Error("overlapping new version must set ACTIVE.valid_to=now");
  }

  // eslint-disable-next-line no-console
  console.log("scenario 2 OK — overlapping valid_from sets ACTIVE.valid_to=now");
}

async function scenarioMissionKeepsRateCardSnapshot(userId: number) {
  await serviceContractsRepo.deleteContractsForMine(1);

  const rc1 = await rateCardsRepo.createDraftRateCard({
    mine_id: 1,
    cooperative_id: 1,
    operation_type: "TONNAGE",
    material_type: "ORE",
    unit_type: "TON",
    rate: 14_000,
    effective_from: VALID_FROM,
    created_by: userId,
  });
  await rateCardsRepo.activateRateCard(rc1.id, userId);

  const v1 = await serviceContractsRepo.createDraftServiceContract({
    mine_id: 1,
    cooperative_id: 1,
    operation_type_code: "HAUL_TONNAGE",
    unit: "TON",
    base_rate_rial: 12_000,
    fixed_community_amount_rial_per_unit: 400_000,
    rate_card_id: rc1.id,
    valid_from: VALID_FROM,
    created_by: userId,
  });
  await dualSignAndActivate(v1.id, userId);

  const owner = await prisma.fleet_owners.findFirst();
  const driver = await prisma.drivers.findFirst();
  const vehicle = await prisma.vehicles.findFirst();
  const load = await prisma.loads.findFirst();
  if (!owner || !driver || !vehicle || !load) {
    throw new Error("seed data missing fleet_owners/drivers/vehicles/loads for mission snapshot test");
  }

  const mission = await prisma.missions.create({
    data: {
      owner_id: owner.id,
      load_id: load.id,
      driver_id: driver.id,
      vehicle_id: vehicle.id,
      status: "VERIFIED",
      rate_card_id: toBig(rc1.id),
      rate_per_ton_snapshot: 14_000,
      verified_at: new Date("2026-05-01"),
    },
  });

  const v2ValidFrom = new Date("2026-08-01T00:00:00.000Z");
  const rc2 = await rateCardsRepo.createDraftRateCard({
    mine_id: 1,
    cooperative_id: 1,
    operation_type: "TONNAGE",
    material_type: "ORE",
    unit_type: "TON",
    rate: 18_000,
    effective_from: v2ValidFrom,
    created_by: userId,
  });

  const { draft: v2Draft } = await serviceContractsRepo.createNewServiceContractVersion({
    source_id: v1.id,
    amendment_ref: "AMEND-RATE-CARD",
    valid_from: v2ValidFrom,
    base_rate_rial: 12_000,
    fixed_community_amount_rial_per_unit: 500_000,
    rate_card_id: rc2.id,
    performed_by_user_id: userId,
  });

  await rateCardsRepo.activateRateCard(rc2.id, userId);

  await serviceContractsRepo.updateDraftServiceContract(v2Draft.id, {
    signed_at_mine: new Date(),
    signed_at_coop: new Date(),
  });
  await serviceContractsRepo.activateServiceContract(v2Draft.id, userId);

  const missionAfter = await prisma.missions.findUnique({ where: { id: mission.id } });
  if (!missionAfter || Number(missionAfter.rate_card_id) !== rc1.id) {
    throw new Error(
      `mission must keep original rate_card_id ${rc1.id}, got ${missionAfter?.rate_card_id}`,
    );
  }

  const active = await serviceContractsRepo.findActiveServiceContract({
    mine_id: 1,
    cooperative_id: 1,
    operation_type_code: "HAUL_TONNAGE",
    at: new Date("2026-09-01"),
  });
  if (!active?.rate_card_id || active.rate_card_id !== rc2.id) {
    throw new Error("active contract should link new rate_card after version activate");
  }

  await prisma.missions.delete({ where: { id: mission.id } });

  // eslint-disable-next-line no-console
  console.log(`scenario 3 OK — mission #${mission.id} kept rate_card_id=${rc1.id}`);
}

async function scenarioDraftAlreadyExists(userId: number) {
  await serviceContractsRepo.deleteContractsForMine(1);

  const v1 = await serviceContractsRepo.createDraftServiceContract({
    mine_id: 1,
    cooperative_id: 1,
    operation_type_code: "HAUL_TONNAGE",
    unit: "TON",
    base_rate_rial: 12_000,
    fixed_community_amount_rial_per_unit: 400_000,
    valid_from: VALID_FROM,
    created_by: userId,
  });
  await dualSignAndActivate(v1.id, userId);

  await serviceContractsRepo.createNewServiceContractVersion({
    source_id: v1.id,
    amendment_ref: "AMEND-A",
    valid_from: new Date("2026-09-01"),
    base_rate_rial: 12_100,
    fixed_community_amount_rial_per_unit: 410_000,
    performed_by_user_id: userId,
  });

  try {
    await serviceContractsRepo.createNewServiceContractVersion({
      source_id: v1.id,
      amendment_ref: "AMEND-B",
      valid_from: new Date("2026-10-01"),
      base_rate_rial: 12_200,
      fixed_community_amount_rial_per_unit: 420_000,
      performed_by_user_id: userId,
    });
    throw new Error("expected draft_already_exists");
  } catch (e) {
    if (!(e instanceof Error) || e.message !== "draft_already_exists") throw e;
  }

  // eslint-disable-next-line no-console
  console.log("scenario 4 OK — blocks second DRAFT while one pending");
}

async function main() {
  const admin = await prisma.users.findFirst({ where: { mobile_number: "09000000000" } });
  if (!admin) throw new Error("admin user missing — run db:seed");
  const userId = Number(admin.id);

  await scenarioNewVersionKeepsActiveUntilActivate(userId);
  await scenarioOverlapSetsValidToNow(userId);
  await scenarioMissionKeepsRateCardSnapshot(userId);
  await scenarioDraftAlreadyExists(userId);

  await serviceContractsRepo.deleteContractsForMine(1);

  // eslint-disable-next-line no-console
  console.log("CONTRACT-VERSION-UI-1: all checks passed");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
