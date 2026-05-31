/** Haversine distance in meters between two WGS84 points. */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Parses `"lat,lng"` or `"lat,lng,radius_m"` from mines.location_coordinates. */
export function parseLocationCoordinates(raw: string | null | undefined): {
  lat: number;
  lng: number;
  radius_m?: number;
} | null {
  if (!raw?.trim()) return null;
  const parts = raw.split(",").map((p) => p.trim());
  if (parts.length < 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const radius_m = parts.length >= 3 ? Number(parts[2]) : undefined;
  return {
    lat,
    lng,
    ...(radius_m != null && Number.isFinite(radius_m) ? { radius_m } : {}),
  };
}

export function isWithinGeofence(params: {
  lat: number;
  lng: number;
  centerLat: number;
  centerLng: number;
  radiusM: number;
}): boolean {
  const d = haversineDistanceMeters(params.lat, params.lng, params.centerLat, params.centerLng);
  return d <= params.radiusM;
}
