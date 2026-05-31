import React, { useCallback, useEffect, useMemo, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { apiGetData, apiPostData } from "../api";
import { useAuthMe } from "../hooks/useAuthMe";

type HourlyLog = {
  id: number;
  vehicle_id?: number;
  raw_hours?: number;
  duration_hours?: number;
  started_at?: string;
  ended_at?: string;
  status: string;
  operator_label?: string;
  equipment_label?: string;
};

function formatDate(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fa-IR");
  } catch {
    return iso.slice(0, 16);
  }
}

function formatHours(h?: number) {
  if (h == null || !Number.isFinite(h)) return "—";
  return h.toFixed(2);
}

function defaultBillableHours(log: HourlyLog) {
  const raw = log.duration_hours ?? log.raw_hours;
  if (raw == null || !Number.isFinite(raw)) return "";
  return raw.toFixed(4);
}

export default function ConsultantHourlyInbox() {
  const { can } = useAuthMe();
  const canVerify = can("hourly:verify");
  const canReject = can("hourly:reject");

  const [logs, setLogs] = useState<HourlyLog[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<HourlyLog | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [verifyTarget, setVerifyTarget] = useState<HourlyLog | null>(null);
  const [billableHours, setBillableHours] = useState("");
  const [verifyReason, setVerifyReason] = useState("");

  const load = useCallback(async () => {
    setErr(null);
    const r = await apiGetData<{ logs: HourlyLog[] }>("/hourly?status=ENDED");
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setLogs(r.data.logs);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openVerify(log: HourlyLog) {
    setVerifyTarget(log);
    setBillableHours(defaultBillableHours(log));
    setVerifyReason("تأیید کارکرد ساعتی");
  }

  const columns: DataTableColumn<HourlyLog>[] = useMemo(
    () => [
      { key: "operator", header: "اپراتور", render: (l) => l.operator_label ?? "—" },
      { key: "equipment", header: "تجهیز", render: (l) => l.equipment_label ?? l.vehicle_id ?? "—" },
      { key: "started", header: "شروع", render: (l) => formatDate(l.started_at) },
      { key: "ended", header: "پایان", render: (l) => formatDate(l.ended_at) },
      {
        key: "hours",
        header: "مدت (ساعت)",
        render: (l) => formatHours(l.duration_hours ?? l.raw_hours),
      },
      { key: "status", header: "وضعیت", render: (l) => l.status },
      {
        key: "actions",
        header: "عملیات",
        render: (l) =>
          l.status === "ENDED" ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {canVerify && (
                <button
                  type="button"
                  data-testid={`verify-${l.id}`}
                  disabled={busy === l.id}
                  onClick={() => openVerify(l)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid #86EFAC",
                    background: "#F0FDF4",
                    color: "#166534",
                    cursor: busy === l.id ? "wait" : "pointer",
                  }}
                >
                  تأیید
                </button>
              )}
              {canReject && (
                <button
                  type="button"
                  data-testid={`reject-${l.id}`}
                  disabled={busy === l.id}
                  onClick={() => {
                    setRejectTarget(l);
                    setRejectReason("");
                  }}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid #FCA5A5",
                    background: "#FEF2F2",
                    color: "#B91C1C",
                    cursor: busy === l.id ? "wait" : "pointer",
                  }}
                >
                  رد
                </button>
              )}
            </div>
          ) : (
            "—"
          ),
      },
    ],
    [busy, canVerify, canReject],
  );

  async function submitVerify() {
    if (!verifyTarget) return;
    const hours = Number(billableHours);
    if (!(hours > 0) || verifyReason.trim().length < 3) return;

    setBusy(verifyTarget.id);
    setErr(null);
    const r = await apiPostData<{ log: HourlyLog }>(`/hourly/${verifyTarget.id}/verify`, {
      billable_hours: hours,
      reason: verifyReason.trim(),
    });
    setBusy(null);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setVerifyTarget(null);
    setBillableHours("");
    setVerifyReason("");
    setLogs((prev) => prev.filter((l) => l.id !== verifyTarget.id));
  }

  async function submitReject() {
    if (!rejectTarget) return;
    setBusy(rejectTarget.id);
    setErr(null);
    const r = await apiPostData<{ log: HourlyLog }>(`/hourly/${rejectTarget.id}/reject`, {
      rejection_reason: rejectReason,
    });
    setBusy(null);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setRejectTarget(null);
    setRejectReason("");
    setLogs((prev) => prev.filter((l) => l.id !== rejectTarget.id));
  }

  const verifyHours = Number(billableHours);
  const verifyValid = verifyHours > 0 && verifyReason.trim().length >= 3;

  return (
    <PageFrame
      title="صندوق کارکرد ساعتی"
      intro="کارکردهای ENDED در انتظار تأیید/رد توسط مشاور."
      expectedRoles={["CONSULTANT", "ADMIN"]}
    >
      {err && (
        <div style={{ marginBottom: 12, padding: 10, background: "#FEE2E2", color: "#991B1B", borderRadius: 8 }}>
          {err}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={logs}
        rowKey={(l) => String(l.id)}
        emptyMessage="کارکرد ENDEDی یافت نشد."
        testId="consultant-hourly-table"
      />

      {verifyTarget && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="verify-modal"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => !busy && setVerifyTarget(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 20,
              width: "min(480px, 92vw)",
              boxShadow: "none",
              border: "1px solid #D8D4CC",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>تأیید کارکرد #{verifyTarget.id}</h3>
            <p style={{ color: "#6B7280", fontSize: 14 }}>
              مدت ثبت‌شده: {formatHours(verifyTarget.duration_hours ?? verifyTarget.raw_hours)} ساعت
            </p>
            <label style={{ display: "block", marginBottom: 12, fontSize: 14 }}>
              ساعات قابل‌صورتحساب
              <input
                type="number"
                step="0.0001"
                min="0"
                data-testid="verify-billable-hours"
                value={billableHours}
                onChange={(e) => setBillableHours(e.target.value)}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 6,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #E5E7EB",
                  boxSizing: "border-box",
                }}
              />
            </label>
            <label style={{ display: "block", marginBottom: 12, fontSize: 14 }}>
              دلیل تأیید (حداقل ۳ کاراکتر)
              <input
                type="text"
                data-testid="verify-reason"
                value={verifyReason}
                onChange={(e) => setVerifyReason(e.target.value)}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 6,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #E5E7EB",
                  boxSizing: "border-box",
                }}
              />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setVerifyTarget(null)} disabled={busy != null}>
                انصراف
              </button>
              <button
                type="button"
                data-testid="verify-submit"
                disabled={!verifyValid || busy != null}
                onClick={() => void submitVerify()}
                style={{
                  background: verifyValid ? "#166534" : "#E5E7EB",
                  color: verifyValid ? "#fff" : "#9CA3AF",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: 8,
                }}
              >
                ثبت تأیید
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectTarget && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="reject-modal"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => !busy && setRejectTarget(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 20,
              width: "min(480px, 92vw)",
              boxShadow: "none",
              border: "1px solid #D8D4CC",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>رد کارکرد #{rejectTarget.id}</h3>
            <p style={{ color: "#6B7280", fontSize: 14 }}>
              مدت ثبت‌شده: {formatHours(rejectTarget.duration_hours ?? rejectTarget.raw_hours)} ساعت — دلیل رد حداقل ۱۰
              کاراکتر.
            </p>
            <textarea
              data-testid="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              placeholder="دلیل رد کارکرد..."
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #E5E7EB",
                fontFamily: "inherit",
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button type="button" onClick={() => setRejectTarget(null)} disabled={busy != null}>
                انصراف
              </button>
              <button
                type="button"
                data-testid="reject-submit"
                disabled={rejectReason.trim().length < 10 || busy != null}
                onClick={() => void submitReject()}
                style={{
                  background: rejectReason.trim().length >= 10 ? "#B91C1C" : "#E5E7EB",
                  color: rejectReason.trim().length >= 10 ? "#fff" : "#9CA3AF",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: 8,
                }}
              >
                ثبت رد
              </button>
            </div>
          </div>
        </div>
      )}
    </PageFrame>
  );
}
