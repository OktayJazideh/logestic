import { describe, expect, it } from "vitest";
import { nationalIdFromSeed, normalizeNationalId, validateIranNationalIdChecksum } from "./nationalId";

describe("nationalId", () => {
  it("validates known valid ID", () => {
    expect(validateIranNationalIdChecksum("0013542419")).toBe(true);
  });

  it("rejects invalid checksum", () => {
    expect(validateIranNationalIdChecksum("0013542410")).toBe(false);
  });

  it("rejects all-same digits", () => {
    expect(validateIranNationalIdChecksum("1111111111")).toBe(false);
  });

  it("builds valid ID from seed", () => {
    const id = nationalIdFromSeed("123456789");
    expect(normalizeNationalId(id)).toHaveLength(10);
    expect(validateIranNationalIdChecksum(id)).toBe(true);
  });
});
