import { appContext } from "../appContext";
import { parseLocationCoordinates } from "../lib/geofence";
import { ruleEngine } from "./ruleEngine";

export type GeofenceTarget = "mine" | "factory";

export type GeofenceConfig = {
  target: GeofenceTarget;
  lat: number;
  lng: number;
  radius_m: number;
  label: string;
};

const DEFAULT_RADIUS_M = 500;

function parseFactoryRuleValue(raw: unknown): { lat: number; lng: number; radius_m?: number; label?: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const radius_m = o.radius_m != null ? Number(o.radius_m) : undefined;
  const label = typeof o.label === "string" ? o.label : undefined;
  return {
    lat,
    lng,
    ...(radius_m != null && Number.isFinite(radius_m) ? { radius_m } : {}),
    ...(label ? { label } : {}),
  };
}

async function defaultRadiusM(mineId: number): Promise<number> {
  const fromRule = await ruleEngine.getNumber("geofence.radius_m", { mineId });
  return fromRule > 0 ? fromRule : DEFAULT_RADIUS_M;
}

export async function resolveMineGeofence(mineId: number): Promise<GeofenceConfig | null> {
  const mine = appContext.mineData.getMine(mineId);
  if (!mine) return null;
  const parsed = parseLocationCoordinates(mine.location_coordinates);
  if (!parsed) return null;
  const radius_m = parsed.radius_m ?? (await defaultRadiusM(mineId));
  return {
    target: "mine",
    lat: parsed.lat,
    lng: parsed.lng,
    radius_m,
    label: mine.name,
  };
}

/** Factory / destination geofence — finance rule `geofence.factory` or offset from mine. */
export async function resolveFactoryGeofence(mineId: number): Promise<GeofenceConfig | null> {
  const mine = appContext.mineData.getMine(mineId);
  if (!mine) return null;

  const ruleRaw = await ruleEngine.get("geofence.factory", { mineId });
  const fromRule = parseFactoryRuleValue(ruleRaw);
  const radius_m = fromRule?.radius_m ?? (await defaultRadiusM(mineId));

  if (fromRule) {
    return {
      target: "factory",
      lat: fromRule.lat,
      lng: fromRule.lng,
      radius_m,
      label: fromRule.label ?? "مقصد / کارخانه",
    };
  }

  const parsed = parseLocationCoordinates(mine.location_coordinates);
  if (!parsed) return null;
  return {
    target: "factory",
    lat: parsed.lat + 0.05,
    lng: parsed.lng + 0.05,
    radius_m,
    label: "مقصد / کارخانه",
  };
}

export async function resolveGeofenceForMissionStep(params: {
  mineId: number;
  step: "ARRIVED" | "DELIVERED";
}): Promise<GeofenceConfig | null> {
  if (params.step === "ARRIVED") return resolveMineGeofence(params.mineId);
  return resolveFactoryGeofence(params.mineId);
}
