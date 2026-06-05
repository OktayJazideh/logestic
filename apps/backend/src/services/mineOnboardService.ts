import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { appContext } from "../appContext";
import { toBig, toNum } from "../repositories/id";
import * as rateCardsRepo from "../repositories/rateCardsRepository";
import * as serviceContractsRepo from "../repositories/serviceContractsRepository";
import { getMineSettings, type MineGeofenceSettings } from "./mineSettingsService";

const DEFAULT_OPERATION = "HAUL_TONNAGE";
const DEFAULT_ORE_RATE_RIAL = 12_000;
const DEFAULT_GEOFENCE_RADIUS_M = 500;

export type MineOnboardInput = {
  name: string;
  slug: string;
  platform_fee: number;
  community_rial_per_ton: number;
  geofence: MineGeofenceSettings;
  cooperative_name?: string;
  cooperative_iban?: string;
  ore_rate_rial?: number;
  village_name?: string;
};

export type MineOnboardResult = {
  mine_id: number;
  mine_code: string;
  name: string;
  cooperative_id: number;
  rate_card_id: number;
  service_contract_id: number;
  village_id: number | null;
  settings: Awaited<ReturnType<typeof getMineSettings>>;
};

function formatLocationCoordinates(g: MineGeofenceSettings): string {
  const radius = g.radius_m != null && Number.isFinite(g.radius_m) ? g.radius_m : DEFAULT_GEOFENCE_RADIUS_M;
  return `${g.lat},${g.lng},${radius}`;
}

function normalizeSlug(slug: string): string {
  return slug.trim().toUpperCase();
}

export async function onboardMine(userId: number, input: MineOnboardInput): Promise<MineOnboardResult> {
  const mineCode = normalizeSlug(input.slug);
  const platformFee = input.platform_fee;
  const communityRial = input.community_rial_per_ton;
  const oreRate = input.ore_rate_rial ?? DEFAULT_ORE_RATE_RIAL;

  if (platformFee <= 0 || platformFee > 1) {
    throw Object.assign(new Error("invalid_platform_fee"), { code: "invalid_platform_fee" });
  }
  if (communityRial <= 0) {
    throw Object.assign(new Error("invalid_community_rate"), { code: "invalid_community_rate" });
  }
  const { lat, lng } = input.geofence;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw Object.assign(new Error("invalid_geofence"), { code: "invalid_geofence" });
  }

  const existing = await prisma.mines.findUnique({ where: { mine_code: mineCode } });
  if (existing) {
    throw Object.assign(new Error("mine_code_exists"), { code: "mine_code_exists" });
  }

  const cooperativeName = input.cooperative_name?.trim() || `تعاونی ${input.name.trim()}`;
  const validFrom = new Date();
  validFrom.setUTCHours(0, 0, 0, 0);

  const mine = await prisma.mines.create({
    data: {
      mine_code: mineCode,
      name: input.name.trim(),
      location_coordinates: formatLocationCoordinates(input.geofence),
      platform_fee_value: new Prisma.Decimal(platformFee),
    },
  });
  const mineId = toNum(mine.id);

  const cooperative = await prisma.cooperatives.create({
    data: {
      mine_id: mine.id,
      name: cooperativeName,
      iban: input.cooperative_iban?.trim() || null,
      status: "ACTIVE",
      settings_json: { household_approval_quorum: 1 },
    },
  });
  const cooperativeId = toNum(cooperative.id);

  const oreDraft = await rateCardsRepo.createDraftRateCard({
    mine_id: mineId,
    operation_type: "TONNAGE",
    material_type: "ORE",
    unit_type: "TON",
    rate: oreRate,
    effective_from: validFrom,
    created_by: userId,
  });
  const { activated: rateCard } = await rateCardsRepo.activateRateCard(oreDraft.id, userId);

  const contractDraft = await serviceContractsRepo.createDraftServiceContract({
    mine_id: mineId,
    cooperative_id: cooperativeId,
    operation_type_code: DEFAULT_OPERATION,
    unit: "TON",
    base_rate_rial: oreRate,
    fixed_community_amount_rial_per_unit: communityRial,
    rate_card_id: rateCard.id,
    valid_from: validFrom,
    contract_version: 1,
    created_by: userId,
  });
  const now = new Date();
  await serviceContractsRepo.updateDraftServiceContract(contractDraft.id, {
    signed_at_mine: now,
    signed_at_coop: now,
  });
  const { activated: serviceContract } = await serviceContractsRepo.activateServiceContract(
    contractDraft.id,
    userId,
  );

  let villageId: number | null = null;
  const villageName = input.village_name?.trim() || "روستای پیش‌فرض";
  if (villageName) {
    const village = await prisma.villages.create({
      data: {
        mine_id: mine.id,
        name: villageName,
        district: "پیش‌فرض",
      },
    });
    villageId = toNum(village.id);
  }

  await prisma.audit_logs.create({
    data: {
      entity_type: "mine",
      entity_id: String(mineId),
      action: "ONBOARD",
      after_value: {
        mine_code: mineCode,
        cooperative_id: cooperativeId,
        rate_card_id: rateCard.id,
        service_contract_id: serviceContract.id,
        village_id: villageId,
      },
      performed_by_user_id: toBig(userId),
      reason: "admin-mine-onboard",
    },
  });

  const result = {
    mine_id: mineId,
    mine_code: mineCode,
    name: mine.name,
    cooperative_id: cooperativeId,
    rate_card_id: rateCard.id,
    service_contract_id: serviceContract.id,
    village_id: villageId,
  };

  await appContext.mineData.hydrate();

  const settings = await getMineSettings(result.mine_id, {
    cooperative_id: result.cooperative_id,
    operation_type_code: DEFAULT_OPERATION,
  });
  if (!settings) {
    throw Object.assign(new Error("mine_not_found"), { code: "mine_not_found" });
  }

  return { ...result, settings };
}
