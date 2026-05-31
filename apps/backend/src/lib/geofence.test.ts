import { describe, expect, it } from "vitest";
import { haversineDistanceMeters, isWithinGeofence, parseLocationCoordinates } from "./geofence";

describe("geofence", () => {
  it("parses lat,lng and optional radius", () => {
    expect(parseLocationCoordinates("27.0,55.0")).toEqual({ lat: 27, lng: 55 });
    expect(parseLocationCoordinates("27.0,55.0,300")).toEqual({ lat: 27, lng: 55, radius_m: 300 });
  });

  it("haversine is zero for same point", () => {
    expect(haversineDistanceMeters(27, 55, 27, 55)).toBe(0);
  });

  it("isWithinGeofence respects radius", () => {
    expect(
      isWithinGeofence({
        lat: 27.0,
        lng: 55.0,
        centerLat: 27.0,
        centerLng: 55.0,
        radiusM: 500,
      }),
    ).toBe(true);
    expect(
      isWithinGeofence({
        lat: 28,
        lng: 56,
        centerLat: 27,
        centerLng: 55,
        radiusM: 500,
      }),
    ).toBe(false);
  });
});
