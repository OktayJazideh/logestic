import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DataTable } from "../components/DataTable";
import { PageFrame } from "../components/PageFrame";
import {
  FinanceLoadDetailModal,
  type FinanceMissionDetail,
} from "../components/FinanceLoadDetail";
import { API_BASE, apiGetData, apiPostData, getStoredToken } from "../api";
import {
  financeDisplayLabels,
  PLATFORM_LEGAL_TERMS_FA,
  type FinanceDisplayLabels,
} from "../lib/platformLegal";
import { JalaliMonthPicker } from "../components/JalaliMonthPicker";
import { formatMoney } from "../lib/formatMoney";
import { todayGregorianYm } from "../lib/jalaliDate";
import { Alert, Button, FilterBar, FilterField, StatCard } from "../components/ui";
import { FormField } from "../components/FormField";
import {
  alertStyle,
  brand,
  btnSecondary,
  cardStyle as themeCard,
  inputStyle,
  sectionStyle,
  space,
  tableCellPadding,
  tableThStyle,
} from "../theme";

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

const btn = btnSecondary;
const th = tableThStyle;
const td: React.CSSProperties = { border: `1px solid ${brand.border}`, padding: tableCellPadding };

function formatTons(n: number) {
  return n.toLocaleString("fa-IR", { maximumFractionDigits: 1 });
}

function entityLabel(t: IbanRow["entity_type"]) {
  if (t === "fleet_owner") return "مالک ناوگان";
  if (t === "household") return "خانوار";
  return "تعاونی";
}

export default function AdminFinance() {
  const nowYm = todayGregorianYm();
  const [year, setYear] = useState(nowYm.year);
  const [month, setMonth] = useState(nowYm.month);
  const [mineId, setMineId] = useState<string>("");
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [missions, setMissions] = useState<FinanceMissionRow[]>([]);
  const [detailRow, setDetailRow] = useState<FinanceMissionRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});

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

  const chartData = useMemo(
    () =>
      summary?.chart.map((p) => ({
        label: p.label,
        operational: p.operational_total_rial,
        community: p.community_pool_contributions_rial,
      })) ?? [],
    [summary?.chart],
  );

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
      {error && <Alert variant="danger">{error}</Alert>}

      <section style={{ ...sectionStyle, marginBottom: space.lg }}>
        <FilterBar>
          <FilterField minWidth={200}>
            <JalaliMonthPicker
              label="دوره (شمسی)"
              year={year}
              month={month}
              showPeriodHint={false}
              onChange={(y, m) => {
                setYear(y);
                setMonth(m);
              }}
            />
          </FilterField>
          <FilterField minWidth={140}>
            <FormField label="معدن (اختیاری)">
              <input
                value={mineId}
                onChange={(e) => setMineId(e.target.value)}
                placeholder="mine_id"
                style={{ ...inputStyle, width: 120 }}
              />
            </FormField>
          </FilterField>
          <FilterField minWidth="auto">
            <Button disabled={busy} onClick={() => void load()}>
              بروزرسانی
            </Button>
          </FilterField>
        </FilterBar>
      </section>

      {summary && (
        <>
          <p dir="rtl" style={alertStyle("info")}>
            {termsFa}
          </p>

          <PlatformLegalSections cards={summary.cards} labels={displayLabels} />

          <section style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <h2 style={{ fontSize: 16, color: brand.primaryDark, margin: 0 }}>۴. ماموریت‌های VERIFIED</h2>
              <Link to="/panel/admin/finance/by-load" style={{ fontSize: 13, color: brand.primaryDark }}>
                جدول per-load (بازه تاریخ) →
              </Link>
            </div>
            <MissionsTable rows={missions} labels={displayLabels} onDetail={setDetailRow} />
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, color: brand.primaryDark }}>۵. نمودار سه ماه اخیر</h2>
            <div style={{ ...themeCard, maxWidth: 720, padding: space.md, height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={brand.border} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <Legend />
                  <Bar dataKey="operational" name={displayLabels.operational_settlement.fa} fill={brand.primary} />
                  <Bar dataKey="community" name={displayLabels.restricted_community_fund.fa} fill={brand.accent} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, color: brand.primaryDark }}>۶. تکمیلی دوره</h2>
            <SupplementaryCards cards={summary.cards} labels={displayLabels} />
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, color: brand.primaryDark }}>۷. جدول IBAN</h2>
            <DataTable
              testId="admin-finance-iban-table"
              rows={summary.iban_rows}
              rowKey={(row) => `${row.entity_type}:${row.entity_id}`}
              emptyMessage="ردیفی برای IBAN نیست."
              cardActions={(row) => {
                const key = `${row.entity_type}:${row.entity_id}`;
                const full = revealed[key];
                if (full || row.iban_masked === "—") return null;
                return (
                  <IbanRevealRow
                    reason={reasonDraft[key] ?? ""}
                    onReasonChange={(v: string) => setReasonDraft((d) => ({ ...d, [key]: v }))}
                    onReveal={() => void revealIban(row)}
                    disabled={busy}
                  />
                );
              }}
              columns={[
                { key: "type", header: "نوع", render: (row) => entityLabel(row.entity_type) },
                { key: "name", header: "نام", render: (row) => row.name },
                {
                  key: "iban",
                  header: "IBAN",
                  render: (row) => {
                    const key = `${row.entity_type}:${row.entity_id}`;
                    return <span dir="ltr">{revealed[key] ?? row.iban_masked}</span>;
                  },
                },
                {
                  key: "valid",
                  header: "چک‌سام",
                  render: (row) =>
                    row.iban_valid === null ? (
                      <span style={{ color: brand.textMuted }}>—</span>
                    ) : row.iban_valid ? (
                      <span style={{ color: brand.success }}>معتبر</span>
                    ) : (
                      <span style={{ color: brand.danger }}>نامعتبر</span>
                    ),
                },
                {
                  key: "actions",
                  header: "عملیات",
                  cardVisible: false,
                  render: (row) => {
                    const key = `${row.entity_type}:${row.entity_id}`;
                    const full = revealed[key];
                    if (full || row.iban_masked === "—") return null;
                    return (
                      <IbanRevealRow
                        reason={reasonDraft[key] ?? ""}
                        onReasonChange={(v: string) => setReasonDraft((d) => ({ ...d, [key]: v }))}
                        onReveal={() => void revealIban(row)}
                        disabled={busy}
                      />
                    );
                  },
                },
              ]}
            />
          </section>

          <section>
            <h2 style={{ fontSize: 16, color: brand.primaryDark }}>۸. Export</h2>
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

function SectionHeading({ titleFa, titleEn }: { titleFa: string; titleEn: string }) {
  return (
    <h2 style={{ fontSize: 16, color: brand.primaryDark, marginTop: 0, marginBottom: 12 }} title={titleEn}>
      {titleFa}
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
        <StatCard
          accent="success"
          label={labels.operational_settlement.fa}
          value={formatMoney(cards.operational_total_rial)}
          hint={`${labels.owner_share.fa}: ${formatMoney(cards.owner_share)} — مسیر عملیاتی داخلی تعاونی`}
        />
      </section>

      <section style={{ marginBottom: 20 }}>
        <SectionHeading
          titleFa={`۲. ${labels.platform_service_fee.fa}`}
          titleEn={labels.platform_service_fee.en}
        />
        <StatCard
          accent="warn"
          label={labels.platform_service_fee.fa}
          value={formatMoney(cards.platform_share)}
          hint="درآمد خدمات پلتفرم — جدا از تسویه عملیاتی"
        />
      </section>

      <section style={{ marginBottom: 0 }}>
        <SectionHeading
          titleFa={`۳. ${labels.restricted_community_fund.fa}`}
          titleEn={labels.restricted_community_fund.en}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <StatCard
            accent="primary"
            label="مشارکت دوره (تن × نرخ)"
            value={formatMoney(cards.community_pool_contributions_rial)}
          />
          <StatCard
            accent="neutral"
            label="موجودی صندوق دوره"
            value={formatMoney(cards.community_pool)}
            hint={labels.restricted_community_fund.fa}
          />
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
    { label: labels.owner_share.fa, value: formatMoney(cards.owner_share), accent: "success" as const },
    { label: labels.platform_service_fee.fa, value: formatMoney(cards.platform_share), accent: "warn" as const },
    {
      label: labels.restricted_community_fund.fa + " (موجودی)",
      value: formatMoney(cards.community_pool),
      accent: "primary" as const,
    },
    { label: "ماموریت VERIFIED", value: String(cards.verified_missions_count), accent: "neutral" as const },
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      {items.map((item) => (
        <StatCard key={item.label} label={item.label} value={item.value} accent={item.accent} />
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
    return <p style={{ color: brand.textMuted, fontSize: 13 }}>ماموریت VERIFIED در این دوره یافت نشد.</p>;
  }
  return (
    <DataTable
      testId="admin-finance-missions-table"
      rows={rows}
      rowKey={(row) => String(row.mission_id)}
      emptyMessage="ماموریت VERIFIED در این دوره یافت نشد."
      cardActions={(row) => (
        <button type="button" style={{ ...btn, fontSize: 13, width: "100%" }} onClick={() => onDetail(row)}>
          نمایش جزئیات
        </button>
      )}
      columns={[
        { key: "load", header: "کد بار", render: (row) => <span dir="ltr">{row.load_tracking_code}</span> },
        { key: "mission", header: "ماموریت", render: (row) => `#${row.mission_id}` },
        {
          key: "operational",
          header: `${labels.operational_settlement.fa} (تومان)`,
          render: (row) => formatMoney(row.operational_total_rial),
        },
        {
          key: "community",
          header: `${labels.restricted_community_fund.fa}`,
          render: (row) => (
            <>
              {formatMoney(row.community_contribution_rial)}
              <span style={{ color: brand.textMuted, fontSize: 12 }}> / {formatTons(row.verified_net_tons)} تن</span>
            </>
          ),
        },
        {
          key: "detail",
          header: "جزئیات",
          cardVisible: false,
          render: (row) => (
            <button type="button" style={{ ...btn, fontSize: 12 }} onClick={() => onDetail(row)}>
              نمایش
            </button>
          ),
        },
      ]}
    />
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
        style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${brand.border}`, fontSize: 12 }}
      />
      <button type="button" style={{ ...btn, fontSize: 12 }} disabled={disabled} onClick={onReveal}>
        نمایش کامل
      </button>
    </div>
  );
}
