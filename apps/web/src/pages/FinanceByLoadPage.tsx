import React, { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageFrame } from "../components/PageFrame";
import { JalaliDatePicker } from "../components/JalaliDatePicker";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { apiGetData } from "../api";
import { formatJalaliDateTime, isoDaysAgo } from "../lib/jalaliDate";
import { financeDisplayLabels } from "../lib/platformLegal";
import { formatMoney } from "../lib/formatMoney";

type FinanceByLoadItem = {
  mission_id: number;
  plate: string;
  verified_net_tons: number;
  operational_fare_rial: number;
  owner_amount_rial: number;
  platform_fee_rial: number;
  community_contribution_rial: number;
  community_rate_per_ton_rial: number;
  payment_hold: boolean;
  hold_amount_rial: number;
  verified_at: string;
};

type FinanceByLoadTotals = {
  operational_fare_rial: number;
  community_contribution_rial: number;
  note: string;
};

type FinanceByLoadResponse = {
  items: FinanceByLoadItem[];
  totals: FinanceByLoadTotals;
  period: { from: string; to: string; mine_id: number };
};

const btn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #D1D5DB",
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

const btnPrimary: React.CSSProperties = {
  ...btn,
  background: "#0F3D17",
  color: "#fff",
  borderColor: "#0F3D17",
};

const inputStyle: React.CSSProperties = {
  display: "block",
  marginTop: 4,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid #D1D5DB",
};

function HoldBadge() {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        background: "#FEF3C7",
        color: "#92400E",
        fontSize: 11,
        fontWeight: 600,
        marginInlineStart: 6,
      }}
    >
      نگهداری
    </span>
  );
}

function itemsToCsv(items: FinanceByLoadItem[]): string {
  const escape = (v: string | number) => {
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const headers = [
    "mission_id",
    "plate",
    "verified_net_tons",
    "operational_fare_rial",
    "owner_amount_rial",
    "platform_fee_rial",
    "community_contribution_rial",
    "community_rate_per_ton_rial",
    "payment_hold",
    "hold_amount_rial",
    "verified_at",
  ];
  const lines = [headers.join(",")];
  for (const row of items) {
    lines.push(
      [
        row.mission_id,
        row.plate,
        row.verified_net_tons,
        row.operational_fare_rial,
        row.owner_amount_rial,
        row.platform_fee_rial,
        row.community_contribution_rial,
        row.community_rate_per_ton_rial,
        row.payment_hold ? "true" : "false",
        row.hold_amount_rial,
        row.verified_at,
      ]
        .map(escape)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

export default function FinanceByLoadPage() {
  const labels = financeDisplayLabels();
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [mineId, setMineId] = useState("1");
  const [data, setData] = useState<FinanceByLoadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    const q = new URLSearchParams({ from, to });
    if (mineId.trim()) q.set("mine_id", mineId.trim());
    const res = await apiGetData<FinanceByLoadResponse>(`/admin/finance/by-load?${q}`);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setData(res.data);
  }, [from, to, mineId]);

  const columns = useMemo<DataTableColumn<FinanceByLoadItem>[]>(
    () => [
      {
        key: "plate",
        header: "پلاک",
        sortable: true,
        sortKey: "plate",
        render: (row) => (
          <span dir="ltr">
            {row.plate}
            {row.payment_hold ? <HoldBadge /> : null}
          </span>
        ),
      },
      {
        key: "verified_net_tons",
        header: "تن خالص",
        sortable: true,
        sortKey: "verified_net_tons",
        render: (row) => row.verified_net_tons.toLocaleString("fa-IR"),
      },
      {
        key: "operational_fare_rial",
        header: `${labels.operational_settlement.fa} (تومان)`,
        sortable: true,
        sortKey: "operational_fare_rial",
        render: (row) => formatMoney(row.operational_fare_rial),
      },
      {
        key: "owner_amount_rial",
        header: `${labels.owner_share.fa} (تومان)`,
        sortable: true,
        sortKey: "owner_amount_rial",
        render: (row) => formatMoney(row.owner_amount_rial),
      },
      {
        key: "platform_fee_rial",
        header: `${labels.platform_service_fee.fa} (تومان)`,
        sortable: true,
        sortKey: "platform_fee_rial",
        render: (row) => formatMoney(row.platform_fee_rial),
      },
      {
        key: "community_contribution_rial",
        header: `${labels.restricted_community_fund.fa} (تومان)`,
        sortable: true,
        sortKey: "community_contribution_rial",
        render: (row) => (
          <span title={`${formatMoney(row.community_rate_per_ton_rial)}/تن`}>
            {formatMoney(row.community_contribution_rial)}
          </span>
        ),
      },
    ],
    [labels],
  );

  function downloadCsv() {
    if (!data?.items.length) return;
    const blob = new Blob([itemsToCsv(data.items)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-by-load-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageFrame
      title="مالی به ازای هر بار"
      expectedRoles={["ADMIN"]}
      intro="مأموریت‌های تأییدشده — کرایه عملیاتی و سهم جامعه (تن×نرخ، مستقل از کرایه)."
    >
      <p style={{ marginBottom: 16, fontSize: 13 }}>
        <Link to="/panel/admin/finance">← داشبورد مالی تجمیعی</Link>
      </p>

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #FCA5A5",
            background: "#FEF2F2",
            color: "#991B1B",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <section style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <JalaliDatePicker label="از تاریخ" value={from} onChange={setFrom} data-testid="finance-by-load-from" />
          <JalaliDatePicker label="تا تاریخ" value={to} onChange={setTo} data-testid="finance-by-load-to" />
          <label style={{ fontSize: 13 }}>
            معدن
            <input
              value={mineId}
              onChange={(e) => setMineId(e.target.value)}
              placeholder="شناسه معدن"
              style={{ ...inputStyle, width: 80 }}
            />
          </label>
          <button type="button" style={btnPrimary} disabled={busy} onClick={() => void load()}>
            بارگذاری
          </button>
          <button
            type="button"
            style={btn}
            disabled={!data?.items.length}
            onClick={downloadCsv}
            data-testid="finance-by-load-export-csv"
          >
            خروجی CSV
          </button>
        </div>
      </section>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(row) => String(row.mission_id)}
        emptyMessage="ماموریت VERIFIED در این بازه یافت نشد."
        testId="finance-by-load-table"
        rowStyle={(row) =>
          row.payment_hold ? { background: "#FFFBEB" } : undefined
        }
      />

      {data && data.items.length > 0 && (
        <div
          style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 10,
            border: "1px solid #E5E7EB",
            background: "#F9FAFB",
            fontSize: 13,
          }}
          data-testid="finance-by-load-totals"
        >
          <div style={{ fontWeight: 700, marginBottom: 8, color: "#0F3D17" }}>جمع دوره</div>
          <div>
            {labels.operational_settlement.fa}:{" "}
            <strong>{formatMoney(data.totals.operational_fare_rial)}</strong>
          </div>
          <div style={{ marginTop: 4 }}>
            {labels.restricted_community_fund.fa}:{" "}
            <strong>{formatMoney(data.totals.community_contribution_rial)}</strong>
            <span style={{ color: "#6B7280", marginInlineStart: 8 }}>({data.totals.note})</span>
          </div>
        </div>
      )}
    </PageFrame>
  );
}
