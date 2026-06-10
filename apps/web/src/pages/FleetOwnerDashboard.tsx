import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { PageFrame } from "../components/PageFrame";
import { apiGetData, getStoredToken } from "../api";
import { formatMoney } from "../lib/formatMoney";
import { formatJalaliDateTime } from "../lib/jalaliDate";

type Summary = {
  verified_missions_count: number;
  missions_in_progress: number;
  pending_settlement_rial: number;
  paid_this_month_rial: number;
  wallet_balance_rial: number;
};

type VehicleRow = {
  id: number;
  plate: string;
  status: string;
  driver_name: string | null;
  capacity_tons: number;
  last_mission_at: string | null;
};

type MissionRow = {
  mission_id: number;
  status: string;
  verified_net_tons: number;
  operational_fare_rial: number;
  owner_amount_rial: number;
  paid: boolean;
  created_at: string;
};

function formatTons(n: number) {
  return n.toLocaleString("fa-IR", { maximumFractionDigits: 2 });
}

function formatDate(iso: string) {
  return formatJalaliDateTime(iso);
}

const statusBadge: Record<string, React.CSSProperties> = {
  APPROVED: { background: "#DCFCE7", color: "#166534", border: "1px solid #86EFAC" },
  PENDING: { background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" },
  REJECTED: { background: "#FEE2E2", color: "#991B1B", border: "1px solid #FCA5A5" },
  SUSPENDED: { background: "#F3F4F6", color: "#374151", border: "1px solid #D1D5DB" },
  NEEDS_CORRECTION: { background: "#FFEDD5", color: "#9A3412", border: "1px solid #FDBA74" },
};

const kpiCard: React.CSSProperties = {
  flex: "1 1 180px",
  padding: 14,
  borderRadius: 10,
  border: "1px solid #D1FAE5",
  background: "#F0FDF4",
};

export default function FleetOwnerDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getStoredToken()) {
      setError("توکن تنظیم نشده.");
      return;
    }
    let cancelled = false;
    Promise.all([
      apiGetData<Summary>("/fleet-owner/summary"),
      apiGetData<VehicleRow[]>("/fleet-owner/vehicles"),
      apiGetData<MissionRow[]>("/fleet-owner/missions?limit=20"),
    ]).then(([s, v, m]) => {
      if (cancelled) return;
      if (!s.ok) {
        setError(s.message);
        return;
      }
      setSummary(s.data);
      setVehicles(v.ok ? v.data : []);
      setMissions(m.ok ? m.data : []);
      setError(null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const emptyMissions = missions.length === 0;

  const vehicleColumns = useMemo<DataTableColumn<VehicleRow>[]>(
    () => [
      { key: "plate", header: "پلاک", render: (v) => v.plate },
      {
        key: "status",
        header: "وضعیت",
        render: (v) => (
          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: 6,
              fontSize: 12,
              ...(statusBadge[v.status] ?? statusBadge.PENDING),
            }}
          >
            {v.status}
          </span>
        ),
      },
      { key: "driver", header: "راننده (آخرین مأموریت)", render: (v) => v.driver_name ?? "—" },
      { key: "capacity", header: "ظرفیت (تن)", render: (v) => formatTons(v.capacity_tons) },
      {
        key: "last",
        header: "آخرین مأموریت",
        render: (v) => (v.last_mission_at ? formatDate(v.last_mission_at) : "—"),
      },
    ],
    [],
  );

  const missionColumns = useMemo<DataTableColumn<MissionRow>[]>(
    () => [
      {
        key: "id",
        header: "شناسه",
        render: (m) => (
          <Link
            to={`/panel/missions/${m.mission_id}`}
            style={{ color: "#1B5E20", fontWeight: 600, textDecoration: "none" }}
          >
            #{m.mission_id}
          </Link>
        ),
      },
      { key: "status", header: "وضعیت", render: (m) => m.status },
      { key: "tons", header: "تن خالص", render: (m) => formatTons(m.verified_net_tons) },
      { key: "fare", header: "کرایه عملیاتی", render: (m) => formatMoney(m.operational_fare_rial) },
      { key: "owner", header: "سهم مالک", render: (m) => formatMoney(m.owner_amount_rial) },
      { key: "paid", header: "پرداخت", render: (m) => (m.paid ? "✓" : "—") },
      { key: "date", header: "تاریخ", render: (m) => formatDate(m.created_at) },
    ],
    [],
  );

  return (
    <PageFrame
      title="داشبورد مالک ناوگان"
      expectedRoles={["FLEET_OWNER"]}
      intro="خلاصه مأموریت‌ها و درآمد عملیاتی در workspace انتخاب‌شده — مبالغ به تومان نمایش داده می‌شوند."
    >
      {error && (
        <div style={{ color: "#B45309", fontSize: 14, marginBottom: 12 }}>{error}</div>
      )}

      {summary && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
          <div style={kpiCard}>
            <div style={{ fontSize: 12, color: "#166534" }}>مأموریت‌های تأییدشده</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
              {summary.verified_missions_count.toLocaleString("fa-IR")}
            </div>
          </div>
          <div style={kpiCard}>
            <div style={{ fontSize: 12, color: "#166534" }}>در حال اجرا</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
              {summary.missions_in_progress.toLocaleString("fa-IR")}
            </div>
          </div>
          <div style={kpiCard}>
            <div style={{ fontSize: 12, color: "#166534" }}>در انتظار تسویه</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{formatMoney(summary.pending_settlement_rial)}</div>
          </div>
          <div style={kpiCard}>
            <div style={{ fontSize: 12, color: "#166534" }}>پرداخت این ماه</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{formatMoney(summary.paid_this_month_rial)}</div>
          </div>
          <div style={kpiCard}>
            <div style={{ fontSize: 12, color: "#166534" }}>موجودی کیف</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{formatMoney(summary.wallet_balance_rial)}</div>
          </div>
        </div>
      )}

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>ناوگان</h3>
        {vehicles.length === 0 ? (
          <div style={{ color: "#6B7280", fontSize: 14 }}>وسیله‌ای ثبت نشده.</div>
        ) : (
          <DataTable
            testId="fleet-owner-vehicles-table"
            rows={vehicles}
            rowKey={(v) => String(v.id)}
            columns={vehicleColumns}
            emptyMessage="وسیله‌ای ثبت نشده."
          />
        )}
      </section>

      <section>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>مأموریت‌های اخیر</h3>
        {emptyMissions ? (
          <div style={{ color: "#6B7280", fontSize: 14 }}>هنوز مأموریتی ثبت نشده</div>
        ) : (
          <DataTable
            testId="fleet-owner-missions-table"
            rows={missions}
            rowKey={(m) => String(m.mission_id)}
            columns={missionColumns}
            emptyMessage="هنوز مأموریتی ثبت نشده"
            cardActions={(m) => (
              <Link
                to={`/panel/missions/${m.mission_id}`}
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: 10,
                  color: "#1B5E20",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                جزئیات مأموریت
              </Link>
            )}
          />
        )}
      </section>
    </PageFrame>
  );
}
