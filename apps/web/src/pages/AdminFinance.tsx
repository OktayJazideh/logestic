import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PageFrame } from "../components/PageFrame";
import {
  FinanceLoadDetailModal,
  type FinanceMissionDetail,
} from "../components/FinanceLoadDetail";
import { API_BASE, apiGetData, apiPostData, getStoredToken } from "../api";
import {
  financeDisplayLabels,
  PLATFORM_LEGAL_TERMS_FA,
  type DisplayLabel,
  type FinanceDisplayLabels,
} from "../lib/platformLegal";
import { formatMoney } from "../lib/formatMoney";

type FinanceCards = {
  owner_share: number;
  community_pool: number;
  platform_share: number;
  verified_missions_count: number;
  operational_total_rial: number;
  community_pool_contributions_rial: number;
  display_labels?: FinanceDisplayLabels;
};

type ChartPoint = FinanceCards & { year: number; month: number; label: string };

type FinanceMissionRow = FinanceMissionDetail & { verified_at: string };

type IbanRow = {
  entity_type: "fleet_owner" | "household" | "cooperative";
  entity_id: number;
  name: string;
  iban_masked: string;
  iban_valid: boolean | null;
};

type FinanceSummary = {
  period: { year: number; month: number; mine_id?: number };
  cards: FinanceCards;
  chart: ChartPoint[];
  iban_rows: IbanRow[];
  display_labels?: FinanceDisplayLabels;
  terms_fa?: string;
};

declare global {
  interface Window {
    Chart?: new (
      ctx: CanvasRenderingContext2D,
      config: Record<string, unknown>,
    ) => { destroy: () => void };
  }
}

const CHART_CDN = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";

const cardStyle: React.CSSProperties = {
  flex: "1 1 160px",
  padding: 14,
  borderRadius: 10,
  border: "1px solid #E5E7EB",
  background: "#F9FAFB",
};

const sectionCardOperational: React.CSSProperties = {
  ...cardStyle,
  flex: "1 1 240px",
  background: "#F0FDF4",
  borderColor: "#86EFAC",
};

const sectionCardPlatform: React.CSSProperties = {
  ...cardStyle,
  flex: "1 1 240px",
  background: "#FFFBEB",
  borderColor: "#FCD34D",
};

const sectionCardCommunity: React.CSSProperties = {
  ...cardStyle,
  flex: "1 1 240px",
  background: "#F3F1EB",
  borderColor: "#93C5FD",
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

const th: React.CSSProperties = { border: "1px solid #E5E7EB", padding: "8px 10px" };
const td: React.CSSProperties = { border: "1px solid #E5E7EB", padding: "8px 10px" };

function formatTons(n: number) {
  return n.toLocaleString("fa-IR", { maximumFractionDigits: 1 });
}

function entityLabel(t: IbanRow["entity_type"]) {
  if (t === "fleet_owner") return "مالک ناوگان";
  if (t === "household") return "خانوار";
  return "تعاونی";
}

function labelEn(d: DisplayLabel) {
  return d.en;
}

function loadChartJs(): Promise<void> {
  if (window.Chart) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${CHART_CDN}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      if (window.Chart) resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = CHART_CDN;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("chart_js_load_failed"));
    document.head.appendChild(s);
  });
}

export default function AdminFinance() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [mineId, setMineId] = useState<string>("");
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [missions, setMissions] = useState<FinanceMissionRow[]>([]);
  const [detailRow, setDetailRow] = useState<FinanceMissionRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<{ destroy: () => void } | null>(null);

  const periodQuery = useCallback(() => {
    const q = new URLSearchParams({ year: String(year), month: String(month) });
    if (mineId.trim()) q.set("mine_id", mineId.trim());
    return q;
  }, [year, month, mineId]);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    const q = periodQuery();
    const [summaryRes, missionsRes] = await Promise.all([
      apiGetData<{ summary: FinanceSummary }>(`/admin/finance/summary?${q}`),
      apiGetData<{ missions: FinanceMissionRow[] }>(`/admin/finance/missions?${q}`),
    ]);
    setBusy(false);
    if (!summaryRes.ok) {
      setError(summaryRes.message);
      setSummary(null);
      setMissions([]);
      return;
    }
    if (!missionsRes.ok) {
      setError(missionsRes.message);
      setSummary(summaryRes.data.summary);
      setMissions([]);
      return;
    }
    setSummary(summaryRes.data.summary);
    setMissions(missionsRes.data.missions);
  }, [periodQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayLabels =
    summary?.display_labels ?? summary?.cards.display_labels ?? financeDisplayLabels();

  useEffect(() => {
    if (!summary?.chart.length || !chartRef.current) return;
    let cancelled = false;
    const L = displayLabels;

    void loadChartJs()
      .then(() => {
        if (cancelled || !chartRef.current || !window.Chart) return;
        chartInstance.current?.destroy();
        const labels = summary.chart.map((p) => p.label);
        chartInstance.current = new window.Chart!(chartRef.current.getContext("2d")!, {
          type: "bar",
          data: {
            labels,
            datasets: [
              {
                label: L.operational_settlement.fa,
                data: summary.chart.map((p) => p.operational_total_rial),
                backgroundColor: "#1B5E20",
              },
              {
                label: L.restricted_community_fund.fa,
                data: summary.chart.map((p) => p.community_pool_contributions_rial),
                backgroundColor: "#0369A1",
              },
            ],
          },
          options: {
            responsive: true,
            plugins: { legend: { position: "bottom" } },
            scales: { y: { beginAtZero: true } },
          },
        });
      })
      .catch(() => setError("بارگذاری Chart.js از CDN ناموفق بود."));

    return () => {
      cancelled = true;
      chartInstance.current?.destroy();
      chartInstance.current = null;
    };
  }, [summary?.chart, displayLabels]);

  async function revealIban(row: IbanRow) {
    const key = `${row.entity_type}:${row.entity_id}`;
    const reason = (reasonDraft[key] ?? "").trim();
    if (!reason) {
      setError("برای نمایش کامل IBAN، ثبت دلیل الزامی است.");
      return;
    }
    setBusy(true);
    const res = await apiPostData<{ iban: string }>("/admin/finance/iban/reveal", {
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      reason,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setRevealed((prev) => ({ ...prev, [key]: res.data.iban }));
  }

  async function downloadExport(format: "excel" | "pdf") {
    const q = new URLSearchParams({
      year: String(year),
      month: String(month),
      format,
    });
    if (mineId.trim()) q.set("mine_id", mineId.trim());
    const res = await fetch(`${API_BASE}/admin/finance/export?${q}`, {
      headers: { Authorization: `Bearer ${getStoredToken()}` },
    });
    if (!res.ok) {
      setError(`خروجی ${format}: خطای سرور (${res.status})`);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-${year}-${String(month).padStart(2, "0")}.${format === "pdf" ? "pdf" : "csv"}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const termsFa = summary?.terms_fa ?? PLATFORM_LEGAL_TERMS_FA;

  return (
    <PageFrame
      title="داشبورد مالی ادمین"
      expectedRoles={["ADMIN"]}
      intro="پلتفرم: زیرساخت ثبت، تسویه و شفافیت — نه کارفرمای عملیات. سه جریان مالی مجزا (تسویه عملیاتی، کارمزد خدمات پلتفرم، صندوق محدود جامعه)."
    >
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
          <label style={{ fontSize: 13 }}>
            سال
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ display: "block", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB" }}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            ماه
            <input
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              style={{ display: "block", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB" }}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            معدن (اختیاری)
            <input
              value={mineId}
              onChange={(e) => setMineId(e.target.value)}
              placeholder="mine_id"
              style={{ display: "block", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", width: 100 }}
            />
          </label>
          <button type="button" style={btnPrimary} disabled={busy} onClick={() => void load()}>
            بروزرسانی
          </button>
        </div>
      </section>

      {summary && (
        <>
          <p
            dir="rtl"
            style={{
              margin: "0 0 20px",
              padding: 12,
              borderRadius: 10,
              border: "1px solid #D1D5DB",
              background: "#F9FAFB",
              fontSize: 13,
              color: "#374151",
              lineHeight: 1.7,
            }}
          >
            {termsFa}
          </p>

          <PlatformLegalSections cards={summary.cards} labels={displayLabels} />

          <section style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <h2 style={{ fontSize: 16, color: "#0F3D17", margin: 0 }}>۴. ماموریت‌های VERIFIED</h2>
              <Link to="/panel/admin/finance/by-load" style={{ fontSize: 13, color: "#0F3D17" }}>
                جدول per-load (بازه تاریخ) →
              </Link>
            </div>
            <MissionsTable rows={missions} labels={displayLabels} onDetail={setDetailRow} />
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, color: "#0F3D17" }}>۵. نمودار سه ماه اخیر</h2>
            <div style={{ maxWidth: 720, padding: 12, border: "1px solid #E5E7EB", borderRadius: 10 }}>
              <canvas ref={chartRef} height={120} />
            </div>
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, color: "#0F3D17" }}>۶. تکمیلی دوره</h2>
            <SupplementaryCards cards={summary.cards} labels={displayLabels} />
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, color: "#0F3D17" }}>۷. جدول IBAN</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#F3F6F1" }}>
                    <th style={th}>نوع</th>
                    <th style={th}>نام</th>
                    <th style={th}>IBAN</th>
                    <th style={th}>چک‌سام</th>
                    <th style={th}>عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.iban_rows.map((row) => {
                    const key = `${row.entity_type}:${row.entity_id}`;
                    const full = revealed[key];
                    return (
                      <tr key={key}>
                        <td style={td}>{entityLabel(row.entity_type)}</td>
                        <td style={td}>{row.name}</td>
                        <td style={td} dir="ltr">
                          {full ?? row.iban_masked}
                        </td>
                        <td style={td}>
                          {row.iban_valid === null ? (
                            <span style={{ color: "#6B7280" }}>—</span>
                          ) : row.iban_valid ? (
                            <span style={{ color: "#16A34A" }}>معتبر</span>
                          ) : (
                            <span style={{ color: "#DC2626" }}>نامعتبر</span>
                          )}
                        </td>
                        <td style={td}>
                          {!full && row.iban_masked !== "—" && (
                            <IbanRevealRow
                              reason={reasonDraft[key] ?? ""}
                              onReasonChange={(v: string) =>
                                setReasonDraft((d) => ({ ...d, [key]: v }))
                              }
                              onReveal={() => void revealIban(row)}
                              disabled={busy}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 16, color: "#0F3D17" }}>۸. Export</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" style={btn} disabled={busy} onClick={() => void downloadExport("excel")}>
                Excel (CSV)
              </button>
              <button type="button" style={btn} disabled={busy} onClick={() => void downloadExport("pdf")}>
                PDF
              </button>
            </div>
          </section>
        </>
      )}

      <FinanceLoadDetailModal row={detailRow} onClose={() => setDetailRow(null)} />
    </PageFrame>
  );
}

function SectionHeading({
  titleFa,
  titleEn,
}: {
  titleFa: string;
  titleEn: string;
}) {
  return (
    <h2 style={{ fontSize: 16, color: "#0F3D17", marginTop: 0, marginBottom: 12 }}>
      {titleFa}
      <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 400, marginRight: 8 }} dir="ltr">
        ({titleEn})
      </span>
    </h2>
  );
}

function PlatformLegalSections({
  cards,
  labels,
}: {
  cards: FinanceCards;
  labels: FinanceDisplayLabels;
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <section style={{ marginBottom: 20 }}>
        <SectionHeading
          titleFa={`۱. ${labels.operational_settlement.fa}`}
          titleEn={labels.operational_settlement.en}
        />
        <div style={sectionCardOperational}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#14532D" }}>
            {formatMoney(cards.operational_total_rial)}
          </div>
          <div style={{ fontSize: 12, color: "#166534", marginTop: 8 }}>
            {labels.owner_share.fa}: {formatMoney(cards.owner_share)}
          </div>
          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 6 }}>
            مسیر عملیاتی داخلی تعاونی — پلتفرم پرداخت‌کننده کرایه نیست
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <SectionHeading
          titleFa={`۲. ${labels.platform_service_fee.fa}`}
          titleEn={labels.platform_service_fee.en}
        />
        <div style={sectionCardPlatform}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#92400E" }}>
            {formatMoney(cards.platform_share)}
          </div>
          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 6 }} dir="ltr">
            fund_type: PLATFORM_REVENUE
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 0 }}>
        <SectionHeading
          titleFa={`۳. ${labels.restricted_community_fund.fa}`}
          titleEn={labels.restricted_community_fund.en}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <div style={sectionCardCommunity}>
            <div style={{ fontSize: 12, color: "#1E3A2F" }}>مشارکت دوره (تن × نرخ)</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1E3A8A", marginTop: 6 }}>
              {formatMoney(cards.community_pool_contributions_rial)}
            </div>
          </div>
          <div style={sectionCardCommunity}>
            <div style={{ fontSize: 12, color: "#1E3A2F" }}>موجودی صندوق دوره</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1E3A8A", marginTop: 6 }}>
              {formatMoney(cards.community_pool)}
            </div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 6 }} dir="ltr">
              fund_type: COMMUNITY_RESTRICTED — not platform revenue
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SupplementaryCards({
  cards,
  labels,
}: {
  cards: FinanceCards;
  labels: FinanceDisplayLabels;
}) {
  const items = [
    { label: labels.owner_share.fa, sub: labelEn(labels.owner_share), value: formatMoney(cards.owner_share) },
    {
      label: labels.platform_service_fee.fa,
      sub: labelEn(labels.platform_service_fee),
      value: formatMoney(cards.platform_share),
    },
    {
      label: labels.restricted_community_fund.fa + " (موجودی)",
      sub: labelEn(labels.restricted_community_fund),
      value: formatMoney(cards.community_pool),
    },
    { label: "ماموریت VERIFIED", sub: "verified_missions_count", value: String(cards.verified_missions_count) },
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      {items.map((item) => (
        <div key={item.label} style={cardStyle}>
          <div style={{ fontSize: 12, color: "#6B7280" }}>{item.label}</div>
          <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }} dir="ltr">
            {item.sub}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0F3D17", marginTop: 6 }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function MissionsTable({
  rows,
  labels,
  onDetail,
}: {
  rows: FinanceMissionRow[];
  labels: FinanceDisplayLabels;
  onDetail: (row: FinanceMissionRow) => void;
}) {
  if (rows.length === 0) {
    return <p style={{ color: "#6B7280", fontSize: 13 }}>ماموریت VERIFIED در این دوره یافت نشد.</p>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#F3F6F1" }}>
            <th style={th}>کد بار</th>
            <th style={th}>ماموریت</th>
            <th style={th}>{labels.operational_settlement.fa} (تومان)</th>
            <th style={th} title="مستقل از کرایه عملیاتی">
              {labels.restricted_community_fund.fa} (تومان) / تن
            </th>
            <th style={th}>جزئیات</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.mission_id}>
              <td style={td} dir="ltr">
                {row.load_tracking_code}
              </td>
              <td style={td}>#{row.mission_id}</td>
              <td style={td}>{formatMoney(row.operational_total_rial)}</td>
              <td style={td} title="مستقل از کرایه عملیاتی">
                {formatMoney(row.community_contribution_rial)}
                <span style={{ color: "#6B7280", fontSize: 12 }}>
                  {" "}
                  / {formatTons(row.verified_net_tons)} تن
                </span>
              </td>
              <td style={td}>
                <button type="button" style={{ ...btn, fontSize: 12 }} onClick={() => onDetail(row)}>
                  نمایش
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IbanRevealRow({
  reason,
  onReasonChange,
  onReveal,
  disabled,
}: {
  reason: string;
  onReasonChange: (v: string) => void;
  onReveal: () => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 200 }}>
      <input
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
        placeholder="دلیل (audit)"
        style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #E5E7EB", fontSize: 12 }}
      />
      <button type="button" style={{ ...btn, fontSize: 12 }} disabled={disabled} onClick={onReveal}>
        نمایش کامل
      </button>
    </div>
  );
}
