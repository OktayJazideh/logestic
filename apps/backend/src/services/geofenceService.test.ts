import { describe, expect, it, vi, beforeEach } from "vitest";
import { haversineDistanceMeters, isWithinGeofence } from "../lib/geofence";

vi.mock("../appContext", () => ({
  appContext: {
    mineData: {
      getMine: vi.fn(),
    },
  },
}));

import { appContext } from "../appContext";
import { resolveMineGeofence } from "./geofenceService";

describe("resolveMineGeofence", () => {
  beforeEach(() => {
    vi.mocked(appContext.mineData.getMine).mockReturnValue({
      id: 1,
      mine_code: "MINE-A",
      name: "معدن آلفا",
      location_coordinates: "27.0,55.0,500",
    });
  });

  it("returns mine center and radius from coordinates", async () => {
    const cfg = await resolveMineGeofence(1);
    expect(cfg).toEqual({
      target: "mine",
      lat: 27,
      lng: 55,
      radius_m: 500,
      label: "معدن آلفا",
    });
  });

  it("validates sample driver point inside fence", () => {
    const cfg = { lat: 27, lng: 55, radius_m: 500 };
    expect(
      isWithinGeofence({
        lat: 27.001,
        lng: 55.001,
        centerLat: cfg.lat,
        centerLng: cfg.lng,
        radiusM: cfg.radius_m,
      }),
    ).toBe(true);
    const d = haversineDistanceMeters(28, 56, cfg.lat, cfg.lng);
    expect(d).toBeGreaterThan(500);
  });
});
