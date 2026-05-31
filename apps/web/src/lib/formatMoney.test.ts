import { describe, expect, it } from "vitest";
import { formatMoney, rialToToman } from "./formatMoney";

describe("rialToToman", () => {
  it("floors rial to toman", () => {
    expect(rialToToman(10000)).toBe(1000);
    expect(rialToToman(10009)).toBe(1000);
    expect(rialToToman(15)).toBe(1);
  });

  it("returns 0 for zero, negative, and non-finite", () => {
    expect(rialToToman(0)).toBe(0);
    expect(rialToToman(-500)).toBe(0);
    expect(rialToToman(Number.NaN)).toBe(0);
    expect(rialToToman(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("formatMoney", () => {
  it("displays 10000 rial as 1000 toman with Persian digits", () => {
    expect(formatMoney(10000)).toBe("۱٬۰۰۰ تومان");
  });

  it("formats zero", () => {
    expect(formatMoney(0)).toBe("۰ تومان");
  });

  it("guards negative rial as zero toman", () => {
    expect(formatMoney(-10000)).toBe("۰ تومان");
    expect(rialToToman(-100)).toBe(0);
  });

  it("can show rial unit", () => {
    expect(formatMoney(10000, { unit: "rial" })).toBe("۱۰٬۰۰۰ ریال");
  });

  it("can omit unit suffix", () => {
    expect(formatMoney(10000, { showUnit: false })).toBe("۱٬۰۰۰");
  });
});
