/**
 * Seeds baseline master data + demo users into Postgres.
 * Run: npm run db:seed (from apps/backend)
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import * as minesRepo from "../src/repositories/minesRepository";
import * as cooperativesRepo from "../src/repositories/cooperativesRepository";
import * as usersRepo from "../src/repositories/usersRepository";
import * as rateCardsRepo from "../src/repositories/rateCardsRepository";
import * as householdsRepo from "../src/repositories/householdsRepository";
import * as workspaceRepo from "../src/repositories/workspaceMembershipsRepository";
import * as serviceContractsRepo from "../src/repositories/serviceContractsRepository";
import * as driversRepo from "../src/repositories/driversRepository";
import * as fleetOwnersRepo from "../src/repositories/fleetOwnersRepository";
import * as vehiclesRepo from "../src/repositories/vehiclesRepository";
import {
  TAFTAN_COOP_IBAN,
  TAFTAN_FIXED_COMMUNITY_RIAL_PER_UNIT,
  TAFTAN_MINE_CODE,
  TAFTAN_PLATFORM_FEE_VALUE,
} from "./seedConstants";

/** Align with active ORE rate card v2 (2026-03-01) for rate_card_id validation at activation. */
const CONTRACT_VALID_FROM = new Date("2026-03-01T00:00:00.000Z");

async function seedVersionedRates(mineId: number, adminUserId: number): Promise<{ activeOreRateCardId: number }> {
  await prisma.rate_cards.deleteMany({ where: { mine_id: BigInt(mineId) } });

  const jan1 = new Date("2026-01-01T00:00:00.000Z");
  const mar1 = new Date("2026-03-01T00:00:00.000Z");

  const oreV1 = await rateCardsRepo.createDraftRateCard({
    mine_id: mineId,
    operation_type: "TONNAGE",
    material_type: "ORE",
    unit_type: "TON",
    rate: 11000,
    effective_from: jan1,
    created_by: adminUserId,
  });
  await rateCardsRepo.activateRateCard(oreV1.id, adminUserId);

  const oreV2 = await rateCardsRepo.createDraftRateCard({
    mine_id: mineId,
    operation_type: "TONNAGE",
    material_type: "ORE",
    unit_type: "TON",
    rate: 12000,
    effective_from: mar1,
    created_by: adminUserId,
  });
  await rateCardsRepo.activateRateCard(oreV2.id, adminUserId);

  const hourlyV1 = await rateCardsRepo.createDraftRateCard({
    mine_id: mineId,
    operation_type: "HOURLY",
    material_type: rateCardsRepo.HOURLY_MATERIAL_TYPE,
    unit_type: "HOUR",
    rate: 80000,
    effective_from: jan1,
    created_by: adminUserId,
  });
  await rateCardsRepo.activateRateCard(hourlyV1.id, adminUserId);

  const hourlyV2 = await rateCardsRepo.createDraftRateCard({
    mine_id: mineId,
    operation_type: "HOURLY",
    material_type: rateCardsRepo.HOURLY_MATERIAL_TYPE,
    unit_type: "HOUR",
    rate: 85000,
    effective_from: mar1,
    created_by: adminUserId,
  });
  await rateCardsRepo.activateRateCard(hourlyV2.id, adminUserId);

  return { activeOreRateCardId: oreV2.id };
}

async function ensureActiveHaulServiceContract(params: {
  mineId: number;
  cooperativeId: number;
  adminUserId: number;
  rateCardId: number;
}) {
  const existing = await serviceContractsRepo.findActiveServiceContract({
    mine_id: params.mineId,
    cooperative_id: params.cooperativeId,
    operation_type_code: "HAUL_TONNAGE",
  });
  if (existing) {
    if (existing.rate_card_id !== params.rateCardId) {
      await prisma.service_contracts.update({
        where: { id: BigInt(existing.id) },
        data: { rate_card_id: BigInt(params.rateCardId) },
      });
      return { ...existing, rate_card_id: params.rateCardId };
    }
    return existing;
  }

  const draft = await serviceContractsRepo.createDraftServiceContract({
    mine_id: params.mineId,
    cooperative_id: params.cooperativeId,
    operation_type_code: "HAUL_TONNAGE",
    unit: "TON",
    base_rate_rial: 12_000,
    fixed_community_amount_rial_per_unit: TAFTAN_FIXED_COMMUNITY_RIAL_PER_UNIT,
    rate_card_id: params.rateCardId,
    valid_from: CONTRACT_VALID_FROM,
    created_by: params.adminUserId,
  });
  const now = new Date();
  await serviceContractsRepo.updateDraftServiceContract(draft.id, {
    signed_at_mine: now,
    signed_at_coop: now,
  });
  const { activated } = await serviceContractsRepo.activateServiceContract(draft.id, params.adminUserId);
  return activated;
}

async function seedApprovedFleetEntities(params: {
  cooperativeId: number;
  driverUserId: number;
  fleetOwnerUserId: number;
}) {
  const fleetOwner = await fleetOwnersRepo.upsertFleetOwner({
    user_id: params.fleetOwnerUserId,
    cooperative_id: params.cooperativeId,
    full_name: "مالک ناوگان تفتان",
    national_id: "2345678901",
    bank_iban: "IR0000000000000000000001",
    status: "APPROVED",
  });

  await driversRepo.upsertDriver({
    user_id: params.driverUserId,
    cooperative_id: params.cooperativeId,
    full_name: "راننده تفتان",
    license_number: "LIC-TAFTAN-01",
    status: "APPROVED",
  });

  await vehiclesRepo.upsertVehicle({
    owner_id: fleetOwner.id,
    cooperative_id: params.cooperativeId,
    license_plate: "IR-TAFTAN-01",
    vehicle_type: "TRUCK",
    capacity_tons: 20,
    status: "APPROVED",
  });
}

async function main() {
  const mineTaftan = await minesRepo.upsertMine({
    id: 1,
    mine_code: TAFTAN_MINE_CODE,
    name: "معدن طلای تفتان",
    location_coordinates: "27.0,55.0,500",
  });
  await prisma.mines.update({
    where: { id: BigInt(mineTaftan.id) },
    data: { platform_fee_value: TAFTAN_PLATFORM_FEE_VALUE },
  });
  const mineB = await minesRepo.upsertMine({
    id: 2,
    mine_code: "MINE-B",
    name: "معدن بتا",
    location_coordinates: "28.0,56.0",
  });

  await minesRepo.upsertVillage({ id: 1, mine_id: mineTaftan.id, name: "روستای یک", district: "ناحیه ۱" });
  await minesRepo.upsertVillage({ id: 2, mine_id: mineTaftan.id, name: "روستای دو", district: "ناحیه ۱" });
  await minesRepo.upsertVillage({ id: 3, mine_id: mineB.id, name: "روستای سه", district: "ناحیه ۲" });

  await cooperativesRepo.upsertCooperative({
    id: 1,
    mine_id: mineTaftan.id,
    name: "تعاونی روستایی طلای تفتان",
    national_id: "14001234567",
    iban: TAFTAN_COOP_IBAN,
    settings_json: { household_approval_quorum: 1 },
    status: "ACTIVE",
  });
  await cooperativesRepo.upsertCooperative({
    id: 2,
    mine_id: mineB.id,
    name: "تعاونی نمونه بتا",
    settings_json: { household_approval_quorum: 1 },
    status: "ACTIVE",
  });

  const demoUsers: Array<{
    mobile: string;
    role:
      | "ADMIN"
      | "COOP_ADMIN"
      | "COOP_OPERATOR"
      | "OPERATION_ADMIN"
      | "DRIVER"
      | "FLEET_OWNER"
      | "HOUSEHOLD"
      | "CONSULTANT"
      | "OPERATOR"
      | "EMPLOYER";
    cooperative_id?: number;
  }> = [
    { mobile: "09000000000", role: "ADMIN" },
    { mobile: "09000000001", role: "COOP_ADMIN", cooperative_id: 1 },
    { mobile: "09000000002", role: "OPERATION_ADMIN" },
    { mobile: "09000000103", role: "OPERATION_ADMIN" },
    { mobile: "09000000003", role: "DRIVER" },
    { mobile: "09000000004", role: "FLEET_OWNER" },
    { mobile: "09000000005", role: "HOUSEHOLD" },
    { mobile: "09000000006", role: "CONSULTANT" },
    { mobile: "09000000008", role: "OPERATOR" },
    { mobile: "09000000007", role: "EMPLOYER" },
    { mobile: "09000000101", role: "COOP_ADMIN", cooperative_id: 1 },
    { mobile: "09000000102", role: "COOP_ADMIN", cooperative_id: 2 },
    { mobile: "09000000111", role: "COOP_OPERATOR", cooperative_id: 1 },
    { mobile: "09000000112", role: "COOP_OPERATOR", cooperative_id: 2 },
  ];

  const userByMobile = new Map<string, Awaited<ReturnType<typeof usersRepo.upsertUserByMobile>>>();
  for (const u of demoUsers) {
    const row = await usersRepo.upsertUserByMobile(u.mobile, u.role, {
      is_active: true,
      cooperative_id: u.cooperative_id,
    });
    userByMobile.set(u.mobile, row);
  }

  await usersRepo.migrateLegacyCoopRoles();

  async function seedMembership(mobile: string, mine_id: number, role: typeof demoUsers[number]["role"], cooperative_id?: number) {
    const user = userByMobile.get(mobile);
    if (!user) return;
    await workspaceRepo.upsertMembership({
      user_id: user.id,
      mine_id,
      cooperative_id,
      role_in_workspace: role,
      status: "ACTIVE",
    });
  }

  await seedMembership("09000000003", mineTaftan.id, "DRIVER", 1);
  await seedMembership("09000000004", mineTaftan.id, "FLEET_OWNER", 1);
  await seedMembership("09000000005", mineTaftan.id, "HOUSEHOLD", 1);
  await seedMembership("09000000006", mineTaftan.id, "CONSULTANT");
  await seedMembership("09000000008", mineTaftan.id, "OPERATOR");
  await seedMembership("09000000007", mineTaftan.id, "EMPLOYER");
  await seedMembership("09000000001", mineTaftan.id, "COOP_ADMIN", 1);
  await seedMembership("09000000101", mineTaftan.id, "COOP_ADMIN", 1);
  await seedMembership("09000000111", mineTaftan.id, "COOP_OPERATOR", 1);
  await seedMembership("09000000102", mineB.id, "COOP_ADMIN", 2);
  await seedMembership("09000000112", mineB.id, "COOP_OPERATOR", 2);
  await seedMembership("09000001001", mineTaftan.id, "HOUSEHOLD", 1);
  await seedMembership("09000001002", mineB.id, "HOUSEHOLD", 2);

  const admin = await usersRepo.upsertUserByMobile("09000000000", "ADMIN", { is_active: true });

  const hhA = await usersRepo.upsertUserByMobile("09000001001", "HOUSEHOLD", { is_active: true });
  const hhB = await usersRepo.upsertUserByMobile("09000001002", "HOUSEHOLD", { is_active: true });

  await householdsRepo.upsertHousehold({
    user_id: hhA.id,
    village_id: 1,
    cooperative_id: 1,
    head_name: "سرپرست تعاونی تفتان",
    national_id: "1111111111",
    bank_iban: "IR0000000000000000000000",
    status: "APPROVED",
  });
  await householdsRepo.upsertHousehold({
    user_id: hhB.id,
    village_id: 3,
    cooperative_id: 2,
    head_name: "سرپرست تعاونی بتا",
    national_id: "2222222222",
    status: "APPROVED",
  });

  const taftanRates = await seedVersionedRates(mineTaftan.id, admin.id);
  await seedVersionedRates(mineB.id, admin.id);

  const driverUser = userByMobile.get("09000000003")!;
  const fleetOwnerUser = userByMobile.get("09000000004")!;
  await seedApprovedFleetEntities({
    cooperativeId: 1,
    driverUserId: driverUser.id,
    fleetOwnerUserId: fleetOwnerUser.id,
  });

  const contract = await ensureActiveHaulServiceContract({
    mineId: mineTaftan.id,
    cooperativeId: 1,
    adminUserId: admin.id,
    rateCardId: taftanRates.activeOreRateCardId,
  });

  // eslint-disable-next-line no-console
  console.log("Seed OK:", {
    mines: [mineTaftan.mine_code, mineB.mine_code],
    users: demoUsers.length + 2,
    coop_isolation_households: 2,
    rate_cards: "versioned ORE+HOURLY per mine (v1 archived, v2 active)",
    service_contract: {
      id: contract.id,
      operation_type: contract.operation_type_code,
      fixed_community_rial_per_unit: contract.fixed_community_amount_rial_per_unit,
    },
    pilot_fleet: "driver/fleet/vehicle APPROVED",
  });
}

if (require.main === module) {
  main()
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

export { TAFTAN_MINE_CODE, TAFTAN_FIXED_COMMUNITY_RIAL_PER_UNIT } from "./seedConstants";
