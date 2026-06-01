import { describe, expect, it } from "vitest";
import {
  dateRange,
  mobileNumber,
  otpCode,
  positiveNumber,
  required,
  runValidators,
  schemaHasErrors,
  validateSchema,
} from "./validation";

describe("validation", () => {
  it("required rejects empty", () => {
    expect(required("شماره")("")).toMatch(/الزامی/);
    expect(required("شماره")("  ")).toMatch(/الزامی/);
    expect(required("شماره")("1")).toBeUndefined();
  });

  it("mobileNumber matches backend range", () => {
    expect(mobileNumber()("09000000000")).toBeUndefined();
    expect(mobileNumber()("abc")).toMatch(/۹ تا ۱۵/);
    expect(mobileNumber()("123")).toMatch(/۹ تا ۱۵/);
  });

  it("otpCode is 6 digits", () => {
    expect(otpCode()("123456")).toBeUndefined();
    expect(otpCode()("12345")).toMatch(/۶ رقم/);
  });

  it("positiveNumber", () => {
    expect(positiveNumber("نرخ")("12.5")).toBeUndefined();
    expect(positiveNumber("نرخ")("0")).toMatch(/مثبت/);
    expect(positiveNumber("نرخ")("x")).toMatch(/مثبت/);
  });

  it("dateRange", () => {
    expect(dateRange("2026-01-01", "2026-02-01")).toBeUndefined();
    expect(dateRange("2026-03-01", "2026-02-01")).toMatch(/از/);
  });

  it("validateSchema aggregates errors", () => {
    const errors = validateSchema({
      mobile: { value: "", validators: [required("شماره موبایل"), mobileNumber()] },
      otp: { value: "12", validators: [otpCode()] },
    });
    expect(schemaHasErrors(errors)).toBe(true);
    expect(errors.mobile).toBeDefined();
    expect(runValidators("09000000000", [required(), mobileNumber()])).toBeUndefined();
  });
});
