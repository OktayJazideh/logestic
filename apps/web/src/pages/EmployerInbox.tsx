import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { PageFrame } from "../components/PageFrame";
import { formatJalaliDateTime } from "../lib/jalaliDate";
import { apiGetData, apiPostData } from "../api";
import { usePermissions } from "../hooks/usePermissions";

const DISPATCH_ERROR_FA: Record<string, string> = {
  no_dispatch_candidates: "ناوگان در دسترس نیست",
  active_mission_exists: "راننده/وسیله مشغول",
  insufficient_vehicle_capacity: "ظرفیت کافی نیست",
};

function dispatchErrorMessage(code: string | undefined, fallback: string): string {
  if (code && DISPATCH_ERROR_FA[code]) return DISPATCH_ERROR_FA[code];
  return fallback;
}

type NeedRow = {
  id: number;
  mine_id: number;
  employer_user_id: number;
  village_id: number;
  material_type: string;
  quantity_tons: number;
  note?: string;
  status: "PENDING" | "DISPATCHED" | "CANCELLED";
  created_at: string;
  mission_ids?: number[];
};

type DispatchResponse = {
  need: NeedRow;
  assignments: { mission_id: number }[];
};

const statusLabel: Record<NeedRow["status"], string> = {
  PENDING: "در انتظار",
  DISPATCHED: "تخصیص‌شده",
  CANCELLED: "لغو شده",
};

const statusColor: Record<NeedRow["status"], string> = {
  PENDING: "#92400E",
  DISPATCHED: "#166534",
  CANCELLED: "#6B7280",
};

const alertStyle: React.CSSProperties = {
  marginBottom: 12,
  padding: 12,
  borderRadius: 8,
  fontSize: 14,
};

const missionLinkStyle: React.CSSProperties = {
  color: "#1B5E20",
  fontWeight: 600,
  textDecoration: "none",
};

function MissionLinks({ missionIds }: { missionIds: number[] }) {
  if (missionIds.length === 0) return null;
  return (
    <div style={{ marginTop: 4, fontSize: 12, fontWeight: 400 }}>
      {missionIds.map((mid, i) => (
        <React.Fragment key={mid}>
          {i > 0 ? "، " : null}
          <Link
            to={`/panel/missions/${mid}`}
            style={missionLinkStyle}
            data-testid={`employer-need-mission-${mid}`}
          >
            مأموریت #{mid}
          </Link>
        </React.Fragment>
      ))}
    </div>
  );
}

type DispatchToast = { missionIds: number[] } | null;

export default function EmployerInbox() {
  const { canDispatch } = usePermissions();

  const [needs, setNeeds] = useState<NeedRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [dispatchToast, setDispatchToast] = useState<DispatchToast>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [dispatchErrors, setDispatchErrors] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    const r = await apiGetData<{ needs: NeedRow[] }>("/employer/needs");
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setErr(null);
    setNeeds(r.data.needs);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function cancelNeed(id: number) {
    const reason = reasons[id]?.trim();
    if (!reason || reason.length < 3) {
      setErr("برای لغو، دلیل حداقل ۳ کاراکتر وارد کنید.");
      return;
    }
    setBusy(id);
    setErr(null);
    setOk(null);
    setDispatchToast(null);
    const r = await apiPostData<{ need: NeedRow }>(`/employer/needs/${id}/cancel`, { reason });
    setBusy(null);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setOk(`نیاز #${id} لغو شد.`);
    await load();
  }

  async function autoDispatch(id: number) {
    setBusy(id);
    setErr(null);
    setOk(null);
    setDispatchToast(null);
    setDispatchErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    const r = await apiPostData<DispatchResponse>(`/admin/needs/${id}/dispatch`, {});
    setBusy(null);
    if (!r.ok) {
      setDispatchErrors((prev) => ({
        ...prev,
        [id]: dispatchErrorMessage(r.code, r.message),
      }));
      return;
    }

    const missionIds = r.data.assignments.map((a) => a.mission_id);
    setDispatchToast({ missionIds });
    await load();
  }

  const columns = useMemo<DataTableColumn<NeedRow>[]>(() => {
    const cols: DataTableColumn<NeedRow>[] = [
      { key: "id", header: "شناسه", render: (n) => n.id },
      { key: "mine", header: "معدن", render: (n) => n.mine_id },
      { key: "village", header: "روستا", render: (n) => n.village_id },
      { key: "material", header: "ماده", render: (n) => n.material_type },
      { key: "tons", header: "تن", render: (n) => n.quantity_tons },
      {
        key: "status",
        header: "وضعیت",
        render: (n) => (
          <>
            <span
              data-testid={`employer-need-status-${n.id}`}
              style={{
                display: "inline-block",
                padding: n.status === "DISPATCHED" ? "2px 8px" : undefined,
                borderRadius: n.status === "DISPATCHED" ? 6 : undefined,
                background: n.status === "DISPATCHED" ? "#DCFCE7" : undefined,
                color: statusColor[n.status],
                fontWeight: 700,
              }}
            >
              {statusLabel[n.status]}
            </span>
            {n.status === "DISPATCHED" && n.mission_ids?.length ? (
              <MissionLinks missionIds={n.mission_ids} />
            ) : null}
          </>
        ),
      },
      { key: "date", header: "تاریخ", render: (n) => formatJalaliDateTime(n.created_at) },
      { key: "note", header: "یادداشت", render: (n) => n.note ?? "—", cardVisible: false },
    ];
    if (canDispatch) {
      cols.push({
        key: "dispatch",
        header: "عملیات",
        cardVisible: false,
        render: (n) =>
          n.status === "PENDING" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 120 }}>
              <button
                type="button"
                data-testid={`employer-dispatch-${n.id}`}
                disabled={busy === n.id}
                onClick={() => autoDispatch(n.id)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: busy === n.id ? "#9CA3AF" : "#1B5E20",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: busy === n.id ? "not-allowed" : "pointer",
                }}
              >
                {busy === n.id ? "…" : "تخصیص خودکار"}
              </button>
              {dispatchErrors[n.id] ? (
                <span
                  data-testid={`employer-dispatch-error-${n.id}`}
                  style={{ color: "#B91C1C", fontSize: 11, fontWeight: 600 }}
                >
                  {dispatchErrors[n.id]}
                </span>
              ) : null}
            </div>
          ) : (
            "—"
          ),
      });
    }
    cols.push({
      key: "cancel",
      header: "لغو (در انتظار)",
      cardVisible: false,
      render: (n) =>
        n.status === "PENDING" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 140 }}>
            <input
              type="text"
              placeholder="دلیل لغو"
              value={reasons[n.id] ?? ""}
              onChange={(e) => setReasons((prev) => ({ ...prev, [n.id]: e.target.value }))}
              style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #E5E7EB", fontSize: 12 }}
            />
            <button
              type="button"
              disabled={busy === n.id}
              onClick={() => cancelNeed(n.id)}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "none",
                background: busy === n.id ? "#9CA3AF" : "#B45309",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: busy === n.id ? "not-allowed" : "pointer",
              }}
            >
              {busy === n.id ? "…" : "لغو"}
            </button>
          </div>
        ) : (
          "—"
        ),
    });
    return cols;
  }, [canDispatch, busy, dispatchErrors, reasons]);

  return (
    <PageFrame
      title="دفترچه نیازهای کارفرما"
      expectedRoles={["EMPLOYER", "OPERATION_ADMIN", "ADMIN"]}
      intro={
        <p style={{ margin: 0 }}>
          لیست نیازهای ثبت‌شده و وضعیت هر مورد. نیازهای «در انتظار» را می‌توانید با ذکر دلیل لغو کنید.
          {canDispatch ? (
            <>
              {" "}
              برای نقش عملیاتی: دکمه «تخصیص خودکار» بدون انتخاب دستی راننده.
            </>
          ) : null}{" "}
          <Link to="/panel/employer" style={{ color: "#1B5E20", fontWeight: 600 }}>
            ثبت نیاز جدید
          </Link>
        </p>
      }
    >
      {err && (
        <div style={{ ...alertStyle, color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA" }}>{err}</div>
      )}
      {ok && (
        <div style={{ ...alertStyle, color: "#166534", background: "#F0FDF4", border: "1px solid #BBF7D0" }}>{ok}</div>
      )}
      {dispatchToast && dispatchToast.missionIds.length > 0 && (
        <div
          data-testid="employer-inbox-toast"
          style={{ ...alertStyle, color: "#166534", background: "#F0FDF4", border: "1px solid #BBF7D0" }}
        >
          {dispatchToast.missionIds.map((mid, i) => (
            <React.Fragment key={mid}>
              {i > 0 ? "، " : null}
              <Link to={`/panel/missions/${mid}`} style={missionLinkStyle}>
                مأموریت #{mid}
              </Link>
            </React.Fragment>
          ))}
        </div>
      )}

      {needs.length === 0 && !err && (
        <p style={{ color: "#6B7280" }}>هنوز نیازی ثبت نشده است.</p>
      )}

      {needs.length > 0 && (
        <DataTable
          testId="employer-inbox-table"
          rows={needs}
          rowKey={(n) => String(n.id)}
          columns={columns}
          rowTitle={(n) => `نیاز #${n.id}`}
          emptyMessage="هنوز نیازی ثبت نشده است."
          cardActions={(n) =>
            n.status === "PENDING" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {canDispatch ? (
                  <>
                    <button
                      type="button"
                      data-testid={`employer-dispatch-${n.id}`}
                      disabled={busy === n.id}
                      onClick={() => autoDispatch(n.id)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "none",
                        background: busy === n.id ? "#9CA3AF" : "#1B5E20",
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      {busy === n.id ? "…" : "تخصیص خودکار"}
                    </button>
                    {dispatchErrors[n.id] ? (
                      <span style={{ color: "#B91C1C", fontSize: 12, fontWeight: 600 }}>
                        {dispatchErrors[n.id]}
                      </span>
                    ) : null}
                  </>
                ) : null}
                <input
                  type="text"
                  placeholder="دلیل لغو"
                  value={reasons[n.id] ?? ""}
                  onChange={(e) => setReasons((prev) => ({ ...prev, [n.id]: e.target.value }))}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #E5E7EB",
                    fontSize: 14,
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  disabled={busy === n.id}
                  onClick={() => cancelNeed(n.id)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: busy === n.id ? "#9CA3AF" : "#B45309",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {busy === n.id ? "…" : "لغو"}
                </button>
              </div>
            ) : null
          }
        />
      )}
    </PageFrame>
  );
}
