import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { parseLocationCoordinates } from "../lib/geofence";
import { resolveDispatchMode } from "../lib/dispatchMode";
import { toBig, toNum } from "../repositories/id";
import * as serviceContractsRepo from "../repositories/serviceContractsRepository";
import * as cooperativesRepo from "../repositories/cooperativesRepository";
import { appContext } from "../appContext";

export type MineGeofenceSettings = {
  lat: number;
  lng: number;
  radius_m?: number;
};

export type MineSettingsDto = {
  mine_id: number;
  mine_code: string;
  name: string;
  platform_fee_value: number | null;
  allow_legacy_community_percent: boolean;
  geofence: MineGeofenceSettings | null;
  dispatch_mode: "manual" | "auto";
  dispatch_mode_source: "mine" | "env";
  dispatch_mode_stored: "manual" | "auto" | null;
  community_rial_per_ton: number | null;
  service_contract_id: number | null;
  cooperative_id: number;
  operation_type_code: string;
};

export type MineSettingsPatch = {
  platform_fee_value?: number;
  geofence?: MineGeofenceSettings;
  dispatch_mode?: "manual" | "auto" | null;
  community_rial_per_ton?: number;
  cooperative_id?: number;
  operation_type_code?: string;
};

const DEFAULT_COOP_ID = 1;
const DEFAULT_OPERATION = "HAUL_TONNAGE";
const AMENDMENT_REF = "admin-mine-settings";

function serializeGeofence(raw: string | null | undefined): MineGeofenceSettings | null {
  const parsed = parseLocationCoordinates(raw);
  if (!parsed) return null;
  return {
    lat: parsed.lat,
    lng: parsed.lng,
    ...(parsed.radius_m != null ? { radius_m: parsed.radius_m } : {}),
  };
}

function formatLocationCoordinates(g: MineGeofenceSettings): string {
  const radius = g.radius_m != null && Number.isFinite(g.radius_m) ? g.radius_m : 500;
  return `${g.lat},${g.lng},${radius}`;
}

async function loadMineRow(mineId: number) {
  const m = await prisma.mines.findUnique({ where: { id: toBig(mineId) } });
  if (!m) return null;
  return m;
}

async function resolveActiveContract(
  mineId: number,
  cooperativeId: number,
  operationTypeCode: string,
) {
  return serviceContractsRepo.findActiveServiceContract({
    mine_id: mineId,
    cooperative_id: cooperativeId,
    operation_type_code: operationTypeCode,
  });
}

export async function getMineSettings(
  mineId: number,
  opts?: { cooperative_id?: number; operation_type_code?: string },
): Promise<MineSettingsDto | null> {
  const m = await loadMineRow(mineId);
  if (!m) return null;

  const cooperativeId = opts?.cooperative_id ?? DEFAULT_COOP_ID;
  const operationTypeCode = opts?.operation_type_code ?? DEFAULT_OPERATION;
  const dispatch = await resolveDispatchMode(mineId);
  const contract = await resolveActiveContract(mineId, cooperativeId, operationTypeCode);

  return {
    mine_id: toNum(m.id),
    mine_code: m.mine_code,
    name: m.name,
    platform_fee_value: m.platform_fee_value != null ? Number(m.platform_fee_value) : null,
    allow_legacy_community_percent: m.allow_legacy_community_percent,
    geofence: serializeGeofence(m.location_coordinates),
    dispatch_mode: dispatch.effective,
    dispatch_mode_source: dispatch.source,
    dispatch_mode_stored: dispatch.stored,
    community_rial_per_ton: contract
      ? Number(contract.fixed_community_amount_rial_per_unit)
      : null,
    service_contract_id: contract?.id ?? null,
    cooperative_id: cooperativeId,
    operation_type_code: operationTypeCode,
  };
}

async function updateCommunityViaContract(params: {
  mineId: number;
  cooperativeId: number;
  operationTypeCode: string;
  communityRialPerTon: number;
  userId: number;
}): Promise<{ service_contract_id: number }> {
  const active = await resolveActiveContract(
    params.mineId,
    params.cooperativeId,
    params.operationTypeCode,
  );
  if (!active) {
    throw Object.assign(new Error("no_active_service_contract"), { code: "no_active_service_contract" });
  }

  const current = Number(active.fixed_community_amount_rial_per_unit);
  if (Math.abs(current - params.communityRialPerTon) < 0.01) {
    return { service_contract_id: active.id };
  }

  const validFrom = new Date();
  const { draft } = await serviceContractsRepo.amendServiceContract({
    active_id: active.id,
    amendment_ref: AMENDMENT_REF,
    fixed_community_amount_rial_per_unit: params.communityRialPerTon,
    valid_from: validFrom,
    performed_by_user_id: params.userId,
  });

  const now = new Date();
  await serviceContractsRepo.updateDraftServiceContract(draft.id, {
    signed_at_mine: now,
    signed_at_coop: now,
  });

  const { activated } = await serviceContractsRepo.activateServiceContract(draft.id, params.userId);
  return { service_contract_id: activated.id };
}

export async function patchMineSettings(
  mineId: number,
  userId: number,
  patch: MineSettingsPatch,
): Promise<MineSettingsDto> {
  const before = await getMineSettings(mineId, {
    cooperative_id: patch.cooperative_id,
    operation_type_code: patch.operation_type_code,
  });
  if (!before) {
    throw Object.assign(new Error("mine_not_found"), { code: "mine_not_found" });
  }

  const cooperativeId = patch.cooperative_id ?? before.cooperative_id;
  const operationTypeCode = patch.operation_type_code ?? before.operation_type_code;

  const mineUpdate: Prisma.minesUpdateInput = {};

  if (patch.platform_fee_value != null) {
    if (patch.platform_fee_value <= 0 || patch.platform_fee_value > 1) {
      throw Object.assign(new Error("invalid_platform_fee"), { code: "invalid_platform_fee" });
    }
    mineUpdate.platform_fee_value = new Prisma.Decimal(patch.platform_fee_value);
  }

  if (patch.geofence != null) {
    const { lat, lng, radius_m } = patch.geofence;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw Object.assign(new Error("invalid_geofence"), { code: "invalid_geofence" });
    }
    mineUpdate.location_coordinates = formatLocationCoordinates({ lat, lng, radius_m });
  }

  if (patch.dispatch_mode !== undefined) {
    mineUpdate.dispatch_mode = patch.dispatch_mode;
  }

  if (Object.keys(mineUpdate).length > 0) {
    await prisma.mines.update({
      where: { id: toBig(mineId) },
      data: mineUpdate,
    });
    await appContext.mineData.hydrate();
  }

  if (patch.community_rial_per_ton != null) {
    if (patch.community_rial_per_ton <= 0) {
      throw Object.assign(new Error("invalid_community_rate"), { code: "invalid_community_rate" });
    }
    try {
      await updateCommunityViaContract({
        mineId,
        cooperativeId,
        operationTypeCode,
        communityRialPerTon: patch.community_rial_per_ton,
        userId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "no_active_service_contract" || msg === "service_contract_not_found") {
        throw Object.assign(new Error("no_active_service_contract"), { code: "no_active_service_contract" });
      }
      if (msg === "not_active") {
        throw Object.assign(new Error("contract_not_active"), { code: "contract_not_active" });
      }
      throw e;
    }
  }

  const after = await getMineSettings(mineId, { cooperative_id: cooperativeId, operation_type_code: operationTypeCode });
  if (!after) {
    throw Object.assign(new Error("mine_not_found"), { code: "mine_not_found" });
  }

  await prisma.mine_settings_audit.create({
    data: {
      mine_id: toBig(mineId),
      before_value: before as unknown as Prisma.InputJsonValue,
      after_value: after as unknown as Prisma.InputJsonValue,
      performed_by_user_id: toBig(userId),
      reason: AMENDMENT_REF,
    },
  });

  return after;
}

export async function listCooperativesForMineSettings(mineId: number) {
  return cooperativesRepo.listCooperativesByMine(mineId);
}
