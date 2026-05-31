import React from "react";
import { PLATFORM_LEGAL_LABELS } from "../lib/platformLegal";
import { formatMoney } from "../lib/formatMoney";

export type FinanceMissionDetail = {
  mission_id: number;
  load_id: number;
  load_tracking_code: string;
  operational_total_rial: number;
  owner_amount_rial: number;
  platform_amount_rial: number;
  community_contribution_rial: number;
  verified_net_tons: number;
  community_rate_rial_per_ton: number;
};

function formatTons(n: number) {
  return n.toLocaleString("fa-IR", { maximumFractionDigits: 1 });
}

export function FinanceLoadDetail({ row }: { row: FinanceMissionDetail }) {
  const L = PLATFORM_LEGAL_LABELS;
  return (
    <div style={{ fontSize: 14, lineHeight: 1.7, color: "#111827" }}>
      <p style={{ margin: "0 0 8px", color: "#6B7280", fontSize: 13 }}>
        بار <strong dir="ltr">{row.load_tracking_code}</strong> — ماموریت #{row.mission_id}
      </p>
      <div
        style={{
          padding: 12,
          borderRadius: 8,
          background: "#F0FDF4",
          border: "1px solid #BBF7D0",
          marginBottom: 10,
        }}
      >
        <div style={{ fontWeight: 600, color: "#166534", marginBottom: 4 }}>
          {L.operationalSettlement.fa}
          <span style={{ fontSize: 11, fontWeight: 400, color: "#6B7280", marginRight: 6 }} dir="ltr">
            ({L.operationalSettlement.en})
          </span>
        </div>
        <div>
          {formatMoney(row.operational_total_rial)}
          <span style={{ color: "#4B5563", fontSize: 13 }}>
            {" "}
            ({L.ownerShare.fa} {formatMoney(row.owner_amount_rial)} + {L.platformServiceFee.fa}{" "}
            {formatMoney(row.platform_amount_rial)})
          </span>
        </div>
      </div>
      <div
        style={{
          padding: 12,
          borderRadius: 8,
          background: "#F3F1EB",
          border: "1px solid #BFDBFE",
        }}
      >
        <div style={{ fontWeight: 600, color: "#1E3A2F", marginBottom: 4 }}>
          {L.restrictedCommunityFund.fa}
          <span style={{ fontSize: 11, fontWeight: 400, color: "#6B7280", marginRight: 6 }} dir="ltr">
            ({L.restrictedCommunityFund.en})
          </span>
        </div>
        <div>
          {formatMoney(row.community_contribution_rial)}
          <span style={{ color: "#4B5563", fontSize: 13 }}>
            {" "}
            ({formatTons(row.verified_net_tons)} تن × {formatMoney(row.community_rate_rial_per_ton)}/تن)
          </span>
        </div>
        <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>مستقل از مسیر عملیاتی / کرایه</div>
      </div>
    </div>
  );
}

export function FinanceLoadDetailModal({
  row,
  onClose,
}: {
  row: FinanceMissionDetail | null;
  onClose: () => void;
}) {
  if (!row) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 20,
          width: "min(440px, 100%)",
          boxShadow: "none",
          border: "1px solid #D8D4CC",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 14px", fontSize: 16, color: "#0F3D17" }}>جزئیات مالی بار</h3>
        <FinanceLoadDetail row={row} />
        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 16,
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #D1D5DB",
            background: "#fff",
            cursor: "pointer",
            width: "100%",
          }}
        >
          بستن
        </button>
      </div>
    </div>
  );
}
