/**
 * PLATFORM-LEGAL-1: unit + static checks (no DATABASE_URL required).
 * Run 3x: npm run test:platform-legal1
 */
import { financeDisplayLabels, PLATFORM_LEGAL_TERMS_FA } from "../src/types/platformLegal";
import { FUND_TAGS, FundType } from "../src/types/fundAccounting";
import { summaryToCsv, type FinanceSummary } from "../src/services/adminFinanceService";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function runOnce(run: number) {
  const L = financeDisplayLabels();
  assert(L.platform_service_fee.en === "Platform Service Fee", `run ${run}: platform_service_fee.en`);
  assert(L.restricted_community_fund.en === "Restricted Community Fund", `run ${run}: restricted_community_fund.en`);
  assert(L.operational_settlement.en.includes("Operational settlement"), `run ${run}: operational_settlement.en`);
  assert(PLATFORM_LEGAL_TERMS_FA.includes("کارفرمای مستقیم"), `run ${run}: terms_fa`);
  assert(!PLATFORM_LEGAL_TERMS_FA.includes("پرداخت‌کننده کرایه"), `run ${run}: anti-pattern fare payer`);

  assert(FUND_TAGS.platformRevenue.fund_type === FundType.PLATFORM_REVENUE, `run ${run}: platform fund_type`);
  assert(FUND_TAGS.communityRestricted.fund_type === FundType.COMMUNITY_RESTRICTED, `run ${run}: community fund_type`);
  assert(FUND_TAGS.operational.fund_type === FundType.OPERATIONAL, `run ${run}: operational fund_type`);

  const mockSummary: FinanceSummary = {
    period: { year: 2026, month: 5 },
    cards: {
      owner_share: 100,
      community_pool: 50,
      platform_share: 10,
      verified_missions_count: 3,
      operational_total_rial: 110,
      community_pool_contributions_rial: 40,
      display_labels: L,
    },
    chart: [],
    iban_rows: [],
    display_labels: L,
    terms_fa: PLATFORM_LEGAL_TERMS_FA,
  };
  const csv = summaryToCsv(mockSummary);
  assert(csv.includes("کارمزد خدمات پلتفرم"), `run ${run}: csv platform label fa`);
  assert(csv.includes("صندوق محدود جامعه"), `run ${run}: csv community label fa`);
  assert(!csv.includes("سهم پلتفرم"), `run ${run}: csv must not use legacy سهم پلتفرم`);

  console.log(`PLATFORM-LEGAL-1 run ${run}: OK`);
}

async function main() {
  for (let i = 1; i <= 3; i++) runOnce(i);
  console.log("PLATFORM-LEGAL-1: 3/3 runs passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
