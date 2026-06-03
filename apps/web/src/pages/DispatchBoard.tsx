import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageFrame } from "../components/PageFrame";
import { apiGetData, apiPostData, newIdempotencyKey } from "../api";
import { formatJalaliDateTime } from "../lib/jalaliDate";
import { labelFa, MISSION_STATUS_FA, OPERATION_TYPE_FA, WEIGHBRIDGE_STATUS_FA } from "../lib/uiLabels";
import { brand } from "../theme";

const DISPATCH_ERROR_FA: Record<string, string> = {
  no_dispatch_candidates: "ناوگان در دسترس نیست",
  active_mission_exists: "راننده/وسیله مشغول",
  insufficient_vehicle_capacity: "ظرفیت کافی نیست",
};

function dispatchErrorMessage(code: string | undefined, fallback: string): string {
  if (code && DISPATCH_ERROR_FA[code]) return DISPATCH_ERROR_FA[code];
  return fallback;
}

type BoardColumns = {
  PENDING_NEEDS: Array<{
    need_id: number;
    village_name: string;
    quantity_tons: number;
    operation_type: string;
    created_at: string;
  }>;
  DISPATCHED: Array<{
    need_id: number;
    missions: Array<{
      mission_id: number;
      driver_name: string;
      vehicle_plate: string;
      quantity_tons: number;
    }>;
  }>;
  IN_PROGRESS: Array<{
    mission_id: number;
    status: string;
    driver_name: string;
    vehicle_plate: string;
  }>;
  AWAITING_WB: Array<{
    mission_id: number;
    driver_name: string;
    ticket_status: string;
  }>;
  VERIFIED: Array<{
    mission_id: number;
    verified_net_tons: number;
    verified_at: string;
  }>;
};

type DispatchBoardData = {
  columns: BoardColumns;
  generated_at: string;
};

type DispatchResponse = {
  assignments: { mission_id: number }[];
  mission_ids?: number[];
};

const COLUMN_META: Array<{ key: keyof BoardColumns; title: string; hint: string }> = [
  { key: "PENDING_NEEDS", title: "نیاز معطل", hint: "در انتظار تخصیص" },
  { key: "DISPATCHED", title: "تخصیص‌شده", hint: "مأموریت ایجاد شده" },
  { key: "IN_PROGRESS", title: "در جریان", hint: "راننده فعال" },
  { key: "AWAITING_WB", title: "منتظر باسکول", hint: "تحویل شده" },
  { key: "VERIFIED", title: "تأیید شده", hint: "باسکول/تأیید" },
];

const mineralCard: React.CSSProperties = {
  background: brand.panelMuted,
  border: `1px solid ${brand.borderDark}`,
  borderRadius: 6,
  padding: 12,
  marginBottom: 10,
};

const columnShell: React.CSSProperties = {
  flex: "0 0 240px",
  minWidth: 220,
  maxHeight: "72vh",
  overflowY: "auto",
  padding: 10,
  borderRadius: 6,
  background: brand.panel,
  border: `1px solid ${brand.border}`,
};

const columnHeader: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 14,
  color: brand.primaryDark,
  marginBottom: 4,
};

const missionLink: React.CSSProperties = {
  color: brand.primary,
  fontWeight: 600,
  textDecoration: "none",
  display: "block",
};

export default function DispatchBoard() {
  const [board, setBoard] = useState<DispatchBoardData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dispatchBusy, setDispatchBusy] = useState<number | null>(null);
  const [toast, setToast] = useState<{ missionIds: number[] } | null>(null);
  const [dispatchErr, setDispatchErr] = useState<Record<number, string>>({});
  const [leavingNeedId, setLeavingNeedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    const r = await apiGetData<DispatchBoardData>("/admin/dispatch-board");
    setBusy(false);
    if (!r.ok) {
      setErr(r.message);
      setBoard(null);
      return;
    }
    setBoard(r.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  async function autoDispatch(needId: number) {
    setDispatchBusy(needId);
    setToast(null);
    setDispatchErr((prev) => {
      const next = { ...prev };
      delete next[needId];
      return next;
    });

    const r = await apiPostData<DispatchResponse>(
      `/admin/needs/${needId}/dispatch`,
      {},
      { idempotencyKey: newIdempotencyKey() },
    );
    setDispatchBusy(null);

    if (!r.ok) {
      setDispatchErr((prev) => ({
        ...prev,
        [needId]: dispatchErrorMessage(r.code, r.message),
      }));
      return;
    }

    const missionIds = r.data.mission_ids ?? r.data.assignments.map((a) => a.mission_id);
    setLeavingNeedId(needId);
    setToast({ missionIds });
    window.setTimeout(() => {
      setLeavingNeedId(null);
      void load();
    }, 400);
  }

  const cols = board?.columns;

  return (
    <PageFrame
      title="بورد تخصیص (Kanban)"
      expectedRoles={["OPERATION_ADMIN", "ADMIN"]}
      intro={
        <p style={{ margin: 0 }}>
          پایپ‌لاین نیاز → مأموریت برای معدن انتخاب‌شده. تخصیص فقط سیستمی — بدون انتخاب دستی راننده.
        </p>
      }
    >
      <div
        style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}
        data-testid="dispatch-board-toolbar"
      >
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #C4A574",
            background: "#fff",
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? "بارگذاری…" : "بروزرسانی"}
        </button>
        {board?.generated_at && (
          <span style={{ fontSize: 12, color: "#6B7280" }} data-testid="dispatch-board-updated">
            آخرین بروزرسانی: {formatJalaliDateTime(board.generated_at)}
          </span>
        )}
      </div>

      {err && (
        <div style={{ color: "#B91C1C", marginBottom: 12, fontSize: 14 }} data-testid="dispatch-board-error">
          {err}
        </div>
      )}

      {toast && toast.missionIds.length > 0 && (
        <div
          data-testid="dispatch-board-toast"
          style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: 8,
            color: "#166534",
            background: "#F0FDF4",
            border: "1px solid #BBF7D0",
          }}
        >
          {toast.missionIds.map((mid, i) => (
            <React.Fragment key={mid}>
              {i > 0 ? "، " : null}
              <Link to={`/panel/missions/${mid}`} style={missionLink}>
                مأموریت #{mid}
              </Link>
            </React.Fragment>
          ))}
        </div>
      )}

      {cols && (
        <div
          style={{
            display: "flex",
            gap: 12,
            overflowX: "auto",
            paddingBottom: 8,
          }}
          data-testid="dispatch-board"
        >
          {COLUMN_META.map(({ key, title, hint }) => (
            <div key={key} style={columnShell} data-testid={`dispatch-column-${key}`}>
              <div style={columnHeader}>{title}</div>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 10 }}>{hint}</div>

              {key === "PENDING_NEEDS" &&
                cols.PENDING_NEEDS.map((n) => {
                  const isLeaving = leavingNeedId === n.need_id;
                  return (
                    <div
                      key={n.need_id}
                      style={{
                        ...mineralCard,
                        opacity: isLeaving ? 0 : 1,
                        transform: isLeaving ? "translateX(24px)" : "none",
                        transition: "opacity 0.35s ease, transform 0.35s ease",
                      }}
                      data-testid={`dispatch-need-card-${n.need_id}`}
                    >
                      <div style={{ fontWeight: 700, color: "#4A3728" }}>نیاز #{n.need_id}</div>
                      <div style={{ fontSize: 12, marginTop: 6 }}>{n.village_name}</div>
                      <div style={{ fontSize: 12, color: "#57534E" }}>
                        {n.quantity_tons.toLocaleString("fa-IR")} تن · {labelFa(OPERATION_TYPE_FA, n.operation_type)}
                      </div>
                      <button
                        type="button"
                        data-testid={`dispatch-auto-${n.need_id}`}
                        disabled={dispatchBusy === n.need_id}
                        onClick={() => void autoDispatch(n.need_id)}
                        style={{
                          marginTop: 10,
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "none",
                          background: "#0F3D17",
                          color: "#fff",
                          fontWeight: 600,
                          cursor: dispatchBusy === n.need_id ? "wait" : "pointer",
                        }}
                      >
                        {dispatchBusy === n.need_id ? "در حال تخصیص…" : "تخصیص خودکار"}
                      </button>
                      {dispatchErr[n.need_id] && (
                        <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 6 }}>{dispatchErr[n.need_id]}</div>
                      )}
                    </div>
                  );
                })}

              {key === "DISPATCHED" &&
                cols.DISPATCHED.map((row) => (
                  <div key={row.need_id} style={mineralCard} data-testid={`dispatch-dispatched-${row.need_id}`}>
                    <div style={{ fontWeight: 700, color: "#4A3728" }}>نیاز #{row.need_id}</div>
                    {row.missions.map((m) => (
                      <div key={m.mission_id} style={{ fontSize: 12, marginTop: 8 }}>
                        <Link to={`/panel/missions/${m.mission_id}`} style={missionLink}>
                          #{m.mission_id} — {m.driver_name}
                        </Link>
                        <div style={{ color: "#57534E" }}>
                          {m.vehicle_plate} · {m.quantity_tons.toLocaleString("fa-IR")} تن
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

              {key === "IN_PROGRESS" &&
                cols.IN_PROGRESS.map((m) => (
                  <Link
                    key={m.mission_id}
                    to={`/panel/missions/${m.mission_id}`}
                    style={{ ...mineralCard, ...missionLink }}
                    data-testid={`dispatch-mission-${m.mission_id}`}
                  >
                    <div>#{m.mission_id}</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>{m.driver_name}</div>
                    <div style={{ fontSize: 11, color: "#57534E" }}>
                      {m.vehicle_plate} · {labelFa(MISSION_STATUS_FA, m.status)}
                    </div>
                  </Link>
                ))}

              {key === "AWAITING_WB" &&
                cols.AWAITING_WB.map((m) => (
                  <Link
                    key={m.mission_id}
                    to={`/panel/missions/${m.mission_id}`}
                    style={{ ...mineralCard, ...missionLink }}
                    data-testid={`dispatch-mission-${m.mission_id}`}
                  >
                    <div>#{m.mission_id}</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>{m.driver_name}</div>
                    <div style={{ fontSize: 11, color: "#57534E" }}>
                      بلیت: {labelFa(WEIGHBRIDGE_STATUS_FA, m.ticket_status)}
                    </div>
                  </Link>
                ))}

              {key === "VERIFIED" &&
                cols.VERIFIED.map((m) => (
                  <Link
                    key={m.mission_id}
                    to={`/panel/missions/${m.mission_id}`}
                    style={{ ...mineralCard, ...missionLink }}
                    data-testid={`dispatch-mission-${m.mission_id}`}
                  >
                    <div>#{m.mission_id}</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      {m.verified_net_tons.toLocaleString("fa-IR")} تن خالص
                    </div>
                    <div style={{ fontSize: 11, color: "#57534E" }}>
                      {formatJalaliDateTime(m.verified_at)}
                    </div>
                  </Link>
                ))}

              {key === "PENDING_NEEDS" && cols.PENDING_NEEDS.length === 0 && (
                <div style={{ fontSize: 12, color: "#9CA3AF" }}>خالی</div>
              )}
              {key === "DISPATCHED" && cols.DISPATCHED.length === 0 && (
                <div style={{ fontSize: 12, color: "#9CA3AF" }}>خالی</div>
              )}
              {key === "IN_PROGRESS" && cols.IN_PROGRESS.length === 0 && (
                <div style={{ fontSize: 12, color: "#9CA3AF" }}>خالی</div>
              )}
              {key === "AWAITING_WB" && cols.AWAITING_WB.length === 0 && (
                <div style={{ fontSize: 12, color: "#9CA3AF" }}>خالی</div>
              )}
              {key === "VERIFIED" && cols.VERIFIED.length === 0 && (
                <div style={{ fontSize: 12, color: "#9CA3AF" }}>خالی</div>
              )}
            </div>
          ))}
        </div>
      )}
    </PageFrame>
  );
}
