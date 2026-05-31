import { describe, expect, it } from "vitest";
import {
  financeDisplayLabels,
  PLATFORM_LEGAL_LABELS,
  PLATFORM_LEGAL_TERMS_FA,
} from "./platformLegal";
import { FUND_TAGS, FundType } from "./fundAccounting";

describe("PLATFORM-LEGAL-1", () => {
  it("terms paragraph matches spec", () => {
    expect(PLATFORM_LEGAL_TERMS_FA).toContain("کارفرمای مستقیم عملیات معدن نیست");
    expect(PLATFORM_LEGAL_TERMS_FA).not.toMatch(/پرداخت‌کننده کرایه/);
  });

  it("display labels use English API names", () => {
    const L = financeDisplayLabels();
    expect(L.platform_service_fee.en).toBe("Platform Service Fee");
    expect(L.restricted_community_fund.en).toBe("Restricted Community Fund");
    expect(L.operational_settlement.en).toContain("Operational settlement");
    expect(L.owner_share.fa).toContain("مالک");
  });

  it("FUND_TAGS align with ACC-FUND-1 semantic lanes", () => {
    expect(FUND_TAGS.operational.fund_type).toBe(FundType.OPERATIONAL);
    expect(FUND_TAGS.platformRevenue.fund_type).toBe(FundType.PLATFORM_REVENUE);
    expect(FUND_TAGS.communityRestricted.fund_type).toBe(FundType.COMMUNITY_RESTRICTED);
  });

  it("financeDisplayLabels maps all four keys", () => {
    const L = financeDisplayLabels();
    expect(Object.keys(L).sort()).toEqual([
      "operational_settlement",
      "owner_share",
      "platform_service_fee",
      "restricted_community_fund",
    ]);
    expect(L.platform_service_fee).toEqual(PLATFORM_LEGAL_LABELS.platformServiceFee);
  });
});
