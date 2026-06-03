import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { JalaliDatePicker } from "../components/JalaliDatePicker";
import { Button } from "../components/ui";
import { apiGetData, apiPostData } from "../api";
import { formatJalaliDate, isoDaysAgo } from "../lib/jalaliDate";
import { dateRange } from "../lib/validation";
import { brand, cardStyle, inputStyle, space } from "../theme";

type KpiPoint = {
  date: string;
  fleet_efficiency?: number;
  delay_pct?: number;
  hold_pct?: number;
  vehicle_utilization?: number;
  failed_settlement?: number;
  assigned_missions?: number;
  verified_missions?: number;
};

type KpiDashboard = {
  period: { from: string; to: string; mine_id?: number };
  delay_threshold_hours: number;
  series: KpiPoint[];
  latest: KpiPoint | null;
  raw_count: number;
};

const kpiCardStyle: React.CSSProperties = {
  ...cardStyle,
  flex: "1 1 140px",
  marginBottom: 0,
};

const CHART_SERIES: Array<{ key: string; label: string; color: string }> = [
  { key: "fleet", label: "راندمان ناوگان", color: brand.primary },
  { key: "delay", label: "درصد تأخیر", color: "#B45309" },
  { key: "hold", label: "درصد نگهداری پرداخت", color: brand.accent },
  { key: "util", label: "بهره‌وری وسیله", color: "#3D6B8C" },
];

function pct(n: number | undefined) {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}٪`;
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={kpiCardStyle}>
      <div style={{ fontSize: 12, color: brand.textMuted }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6, color: brand.primaryDark }}>{value}</div>
    </div>
  );
}

export default function AdminKpi() {
  const [from, setFrom] = useState(isoDaysAgo(13));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [mineId, setMineId] = useState("");
  const [dashboard, setDashboard] = useState<KpiDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const rangeErr = dateRange(from, to);
    if (rangeErr) {
      setError(rangeErr);
      return;
    }
    if (mineId.trim()) {
      const mineErr = /^[1-9]\d*$/.test(mineId.trim()) ? undefined : "شناسه معدن باید عدد صحیح مثبت باشد.";
      if (mineErr) {
        setError(mineErr);
        return;
      }
    }
    setBusy(true);
    setError(null);
    const q = new URLSearchParams({ from, to });
    if (mineId.trim()) q.set("mine_id", mineId.trim());
    const res = await apiGetData<{ dashboard: KpiDashboard }>(`/admin/kpi/dashboard?${q}`);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      setDashboard(null);
      return;
    }
    setDashboard(res.data.dashboard);
  }, [from, to, mineId]);

  const recompute = useCallback(async () => {
    if (!to.trim()) {
      setError("تاریخ «تا» برای محاسبه مجدد الزامی است.");
      return;
    }
    setBusy(true);
    setError(null);
    const body: { date?: string; mine_id?: number } = { date: to };
    if (mineId.trim()) body.mine_id = Number(mineId.trim());
    const res = await apiPostData<{ result: unknown }>("/admin/kpi/compute", body);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    await load();
  }, [to, mineId, load]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = useMemo(
    () =>
      dashboard?.series.map((p) => ({
        date: formatJalaliDate(p.date),
        fleet: (p.fleet_efficiency ?? 0) * 100,
        delay: (p.delay_pct ?? 0) * 100,
        hold: (p.hold_pct ?? 0) * 100,
        util: (p.vehicle_utilization ?? 0) * 100,
      })) ?? [],
    [dashboard],
  );

  const latest = dashboard?.latest;

  return (
    <PageFrame
      title="شاخص‌های عملکرد"
      intro="راندمان ناوگان، تأخیر، نگهداری پرداخت و بهره‌وری وسیله — بازه تاریخ شمسی."
      expectedRoles={["ADMIN", "OPERATION_ADMIN"]}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <JalaliDatePicker label="از تاریخ" value={from} onChange={setFrom} />
        <JalaliDatePicker label="تا تاریخ" value={to} onChange={setTo} />
        <label style={{ fontSize: 13 }}>
          شناسه معدن
          <input
            type="text"
            value={mineId}
            onChange={(e) => setMineId(e.target.value)}
            placeholder="همه"
            style={{ ...inputStyle, width: 80 }}
          />
        </label>
        <Button variant="secondary" onClick={() => void load()} disabled={busy}>
          بروزرسانی
        </Button>
        <Button onClick={() => void recompute()} disabled={busy}>
          محاسبهٔ مجدد
        </Button>
      </div>

      {dashboard && (
        <p style={{ fontSize: 12, color: brand.textMuted, marginTop: 8 }}>
          آستانهٔ تأخیر: بیش از {dashboard.delay_threshold_hours} ساعت — {dashboard.raw_count.toLocaleString("fa-IR")} رکورد
        لحظه‌ای
        </p>
      )}

      {error && <p style={{ color: brand.danger, marginTop: 12 }}>{error}</p>}

      {latest && (
        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <KpiCard label="راندمان ناوگان" value={pct(latest.fleet_efficiency)} />
          <KpiCard label="درصد تأخیر" value={pct(latest.delay_pct)} />
          <KpiCard label="درصد نگهداری پرداخت" value={pct(latest.hold_pct)} />
          <KpiCard label="بهره‌وری وسیله" value={pct(latest.vehicle_utilization)} />
          <KpiCard label="تسویه ناموفق" value={(latest.failed_settlement ?? 0).toLocaleString("fa-IR")} />
          <KpiCard
            label="تأییدشده / تخصیص‌یافته"
            value={`${(latest.verified_missions ?? 0).toLocaleString("fa-IR")} / ${(latest.assigned_missions ?? 0).toLocaleString("fa-IR")}`}
          />
        </div>
      )}

      {chartData.length > 0 && (
        <div style={{ marginTop: 24, minHeight: 320 }}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}٪`} />
              <Tooltip formatter={(v: number, name: string) => [`${v.toLocaleString("fa-IR")}٪`, CHART_SERIES.find((s) => s.key === name)?.label ?? name]} />
              <Legend formatter={(v) => CHART_SERIES.find((s) => s.key === v)?.label ?? v} />
              {CHART_SERIES.map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.key} stroke={s.color} strokeWidth={2} dot />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </PageFrame>
  );
}
