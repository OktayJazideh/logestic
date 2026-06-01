import React, { useCallback, useEffect, useRef, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { apiGetData, apiPostData } from "../api";

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

declare global {
  interface Window {
    Chart?: new (
      ctx: CanvasRenderingContext2D,
      config: Record<string, unknown>,
    ) => { destroy: () => void };
  }
}

const CHART_CDN = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";

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

const cardStyle: React.CSSProperties = {
  flex: "1 1 140px",
  padding: 14,
  borderRadius: 10,
  border: "1px solid #E5E7EB",
  background: "#F9FAFB",
};

const inputStyle: React.CSSProperties = {
  display: "block",
  marginTop: 4,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid #D1D5DB",
};

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

function pct(n: number | undefined) {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}٪`;
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: "#6B7280" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>{value}</div>
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
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<{ destroy: () => void } | null>(null);

  const load = useCallback(async () => {
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

  useEffect(() => {
    if (!dashboard?.series.length || !chartRef.current) return;
    let cancelled = false;

    void loadChartJs()
      .then(() => {
        if (cancelled || !chartRef.current || !window.Chart) return;
        chartInstance.current?.destroy();
        const labels = dashboard.series.map((p) => p.date);
        chartInstance.current = new window.Chart!(chartRef.current.getContext("2d")!, {
          type: "line",
          data: {
            labels,
            datasets: [
              {
                label: "راندمان ناوگان",
                data: dashboard.series.map((p) => (p.fleet_efficiency ?? 0) * 100),
                borderColor: "#1B5E20",
                tension: 0.2,
              },
              {
                label: "درصد تأخیر",
                data: dashboard.series.map((p) => (p.delay_pct ?? 0) * 100),
                borderColor: "#B45309",
                tension: 0.2,
              },
              {
                label: "درصد HOLD",
                data: dashboard.series.map((p) => (p.hold_pct ?? 0) * 100),
                borderColor: "#7C3AED",
                tension: 0.2,
              },
              {
                label: "Utilization وسیله",
                data: dashboard.series.map((p) => (p.vehicle_utilization ?? 0) * 100),
                borderColor: "#0369A1",
                tension: 0.2,
              },
            ],
          },
          options: {
            responsive: true,
            scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v: string | number) => `${v}%` } } },
          },
        });
      })
      .catch(() => setError("بارگذاری Chart.js ناموفق بود"));

    return () => {
      cancelled = true;
      chartInstance.current?.destroy();
    };
  }, [dashboard]);

  const latest = dashboard?.latest;

  return (
    <PageFrame
      title="داشبورد KPI (KPI-1)"
      intro="راندمان ناوگان، تأخیر، HOLD، Utilization وسیله و failed settlement — محاسبهٔ روزانه از QUEUE-1."
      expectedRoles={["ADMIN", "OPERATION_ADMIN"]}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ fontSize: 13 }}>
          از
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ fontSize: 13 }}>
          تا
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ fontSize: 13 }}>
          معدن (ID)
          <input
            type="text"
            value={mineId}
            onChange={(e) => setMineId(e.target.value)}
            placeholder="همه"
            style={{ ...inputStyle, width: 80 }}
          />
        </label>
        <button type="button" style={btn} onClick={() => void load()} disabled={busy}>
          بروزرسانی
        </button>
        <button type="button" style={btnPrimary} onClick={() => void recompute()} disabled={busy}>
          محاسبهٔ مجدد
        </button>
      </div>

      {dashboard && (
        <p style={{ fontSize: 12, color: "#6B7280", marginTop: 8 }}>
          آستانهٔ تأخیر: بیش از {dashboard.delay_threshold_hours} ساعت — {dashboard.raw_count} رکورد snapshot
        </p>
      )}

      {error && <p style={{ color: "#B91C1C", marginTop: 12 }}>{error}</p>}

      {latest && (
        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <KpiCard label="راندمان ناوگان" value={pct(latest.fleet_efficiency)} />
          <KpiCard label="درصد تأخیر" value={pct(latest.delay_pct)} />
          <KpiCard label="درصد HOLD" value={pct(latest.hold_pct)} />
          <KpiCard label="Utilization وسیله" value={pct(latest.vehicle_utilization)} />
          <KpiCard label="failed settlement" value={String(latest.failed_settlement ?? 0)} />
          <KpiCard
            label="verified / assigned"
            value={`${latest.verified_missions ?? 0} / ${latest.assigned_missions ?? 0}`}
          />
        </div>
      )}

      <div style={{ marginTop: 24, maxHeight: 360 }}>
        <canvas ref={chartRef} />
      </div>
    </PageFrame>
  );
}
