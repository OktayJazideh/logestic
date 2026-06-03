import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageFrame } from "../components/PageFrame";
import { apiGetData } from "../api";
import { formatJalaliDate, formatJalaliDateTime, formatPeriodKeyYm } from "../lib/jalaliDate";
import { labelFa, MISSION_STATUS_FA } from "../lib/uiLabels";
import { brand } from "../theme";

type OpsDashboard = {
  missions_today: { created: number; verified: number; in_progress: number };
  weighbridge_pending: number;
  pool_current_rial: number;
  pool_period_key: string;
  holds_active: number;
  needs_pending_dispatch: number;
  missions_trend_7d: Array<{ date: string; created: number; verified: number }>;
  latest_missions: Array<{
    id: number;
    status: string;
    driver_name: string;
    tons: number | null;
  }>;
  last_updated: string;
};

const kpiCard: React.CSSProperties = {
  flex: "1 1 160px",
  padding: 14,
  borderRadius: 6,
  border: `1px solid ${brand.border}`,
  background: brand.panelMuted,
  minWidth: 140,
};

const th: React.CSSProperties = {
  border: `1px solid ${brand.border}`,
  padding: "8px 10px",
  fontWeight: 700,
  background: brand.panelMuted,
};
const td: React.CSSProperties = { border: `1px solid ${brand.border}`, padding: "8px 10px" };

const quickLink: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 16px",
  borderRadius: 6,
  border: `1px solid ${brand.primary}`,
  background: brand.primaryLight,
  color: brand.primaryDark,
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 13,
  marginLeft: 8,
  marginBottom: 8,
};

function formatRial(rial: number) {
  return `${Math.round(rial).toLocaleString("fa-IR")} ریال`;
}

function formatTons(n: number | null) {
  if (n == null) return "—";
  return `${n.toLocaleString("fa-IR", { maximumFractionDigits: 2 })} تن`;
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={kpiCard}>
      <div style={{ fontSize: 12, color: brand.textMuted }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: brand.text }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: brand.textSoft, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export default function OpsDashboard() {
  const [dash, setDash] = useState<OpsDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await apiGetData<{ dashboard: OpsDashboard }>("/admin/ops-dashboard");
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      setDash(null);
      return;
    }
    setDash(res.data.dashboard);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData =
    dash?.missions_trend_7d.map((p) => ({
      date: formatJalaliDate(p.date),
      created: p.created,
      verified: p.verified,
    })) ?? [];

  return (
    <PageFrame
      title="داشبورد عملیاتی"
      intro="خلاصه وضعیت معدن انتخاب‌شده. برای اقدام از میانبرهای زیر استفاده کنید."
      expectedRoles={["OPERATION_ADMIN", "ADMIN"]}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: `1px solid ${brand.border}`,
            background: brand.panel,
            cursor: busy ? "wait" : "pointer",
            fontFamily: brand.fontFamily,
          }}
        >
          {busy ? "در حال بارگذاری…" : "بروزرسانی"}
        </button>
        {dash?.last_updated && (
          <span style={{ fontSize: 12, color: brand.textMuted, alignSelf: "center" }}>
            آخرین بروزرسانی: {formatJalaliDateTime(dash.last_updated)}
          </span>
        )}
      </div>

      {error && (
        <div style={{ color: brand.warn, marginBottom: 12, fontSize: 14 }} data-testid="ops-dash-error">
          {error}
        </div>
      )}

      {dash && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }} data-testid="ops-kpi-row">
            <KpiCard label="مأموریت ایجادشده امروز" value={dash.missions_today.created.toLocaleString("fa-IR")} />
            <KpiCard label="مأموریت تأییدشده امروز" value={dash.missions_today.verified.toLocaleString("fa-IR")} />
            <KpiCard label="مأموریت در جریان" value={dash.missions_today.in_progress.toLocaleString("fa-IR")} />
            <KpiCard label="تیکت معطل باسکول" value={dash.weighbridge_pending.toLocaleString("fa-IR")} />
            <KpiCard
              label="مجموع سهم دوره جاری"
              value={formatRial(dash.pool_current_rial)}
              hint={`دوره: ${formatPeriodKeyYm(dash.pool_period_key)}`}
            />
            <KpiCard label="پرداخت در نگهداری" value={dash.holds_active.toLocaleString("fa-IR")} />
            <KpiCard label="نیاز در انتظار تخصیص" value={dash.needs_pending_dispatch.toLocaleString("fa-IR")} />
          </div>

          <div style={{ marginBottom: 20 }} data-testid="ops-quick-links">
            <div style={{ fontWeight: 700, marginBottom: 8, color: brand.text }}>میانبرها</div>
            <Link to="/panel/weighbridge" style={quickLink}>
              باسکول
              {dash.weighbridge_pending > 0 ? ` (${dash.weighbridge_pending.toLocaleString("fa-IR")})` : ""}
            </Link>
            <Link to="/panel/employer/inbox" style={quickLink}>
              دفترچه نیاز کارفرما
              {dash.needs_pending_dispatch > 0
                ? ` (${dash.needs_pending_dispatch.toLocaleString("fa-IR")})`
                : ""}
            </Link>
            <Link to="/panel/missions" style={quickLink}>
              بورد مأموریت
            </Link>
            <Link to="/panel/admin/period-statement" style={quickLink}>
              صورت وضعیت دوره
            </Link>
          </div>

          <div
            style={{
              marginBottom: 20,
              padding: 12,
              borderRadius: 10,
              border: `1px solid ${brand.border}`,
              background: brand.panel,
              minHeight: 260,
            }}
            data-testid="ops-mission-chart"
          >
            <div style={{ fontWeight: 700, marginBottom: 12, color: brand.text }}>روند مأموریت — ۷ روز گذشته</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={brand.border} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number, name: string) => [
                    v.toLocaleString("fa-IR"),
                    name === "ایجاد" || name === "created" ? "ایجاد" : "تأیید",
                  ]}
                />
                <Legend formatter={(v) => (v === "ایجاد" || v === "created" ? "ایجاد" : "تأیید")} />
                <Line type="monotone" dataKey="created" name="ایجاد" stroke={brand.accent} strokeWidth={2} dot />
                <Line type="monotone" dataKey="verified" name="تأیید" stroke={brand.primary} strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div data-testid="ops-latest-missions">
            <div style={{ fontWeight: 700, marginBottom: 10, color: brand.text }}>آخرین مأموریت‌ها</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>شناسه</th>
                  <th style={th}>وضعیت</th>
                  <th style={th}>راننده</th>
                  <th style={th}>تناژ</th>
                </tr>
              </thead>
              <tbody>
                {dash.latest_missions.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ ...td, textAlign: "center", color: brand.textMuted }}>
                      مأموریتی ثبت نشده است.
                    </td>
                  </tr>
                )}
                {dash.latest_missions.map((m) => (
                  <tr key={m.id}>
                    <td style={td}>
                      <Link to={`/panel/missions/${m.id}`}>{m.id.toLocaleString("fa-IR")}</Link>
                    </td>
                    <td style={td}>{labelFa(MISSION_STATUS_FA, m.status)}</td>
                    <td style={td}>{m.driver_name}</td>
                    <td style={td}>{formatTons(m.tons)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PageFrame>
  );
}
