/**
 * PLATFORM-LEGAL-1 (#platform-role): infrastructure / settlement / transparency —
 * not the mine's operational employer and not the operational contractor.
 * Labels only; calculation logic unchanged.
 */

export type DisplayLabel = { en: string; fa: string };

/** Short RTL terms paragraph (PanelHome footer, About, exports). */
export const PLATFORM_LEGAL_TERMS_FA =
  "پلتفرم تنها زیرساخت ثبت، محاسبه و شفافیت مالی است و کارفرمای مستقیم عملیات معدن نیست.";

export const PLATFORM_LEGAL_LABELS = {
  platformServiceFee: {
    en: "Platform Service Fee",
    fa: "کارمزد خدمات پلتفرم",
  },
  restrictedCommunityFund: {
    en: "Restricted Community Fund",
    fa: "صندوق محدود جامعه",
  },
  operationalSettlement: {
    en: "Operational settlement (cooperative-internal)",
    fa: "تسویه عملیاتی (داخلی تعاونی)",
  },
  ownerShare: {
    en: "Fleet owner share (operational lane)",
    fa: "سهم مالک ناوگان (مسیر عملیاتی)",
  },
} as const satisfies Record<string, DisplayLabel>;

export type FinanceDisplayLabels = {
  platform_service_fee: DisplayLabel;
  restricted_community_fund: DisplayLabel;
  operational_settlement: DisplayLabel;
  owner_share: DisplayLabel;
};

export function financeDisplayLabels(): FinanceDisplayLabels {
  return {
    platform_service_fee: PLATFORM_LEGAL_LABELS.platformServiceFee,
    restricted_community_fund: PLATFORM_LEGAL_LABELS.restrictedCommunityFund,
    operational_settlement: PLATFORM_LEGAL_LABELS.operationalSettlement,
    owner_share: PLATFORM_LEGAL_LABELS.ownerShare,
  };
}
