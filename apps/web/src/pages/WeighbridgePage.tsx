import React, { useCallback, useEffect, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { MineScope } from "../components/MineScope";
import { apiGetData, apiPostData, getStoredToken } from "../api";
import { useAuthMe } from "../hooks/useAuthMe";

type ManualReasonCode = "SCALE_DOWN" | "NETWORK" | "OTHER";

type TicketRow = {
  id: number;
  mission_id: number;
  ticket_number: string;
  status: string;
  empty_weight?: number;
  loaded_weight?: number;
  net_weight?: number;
  entry_source?: string | null;
  requires_supervisor_approve?: boolean;
  created_at?: string;
};

type TicketDetail = TicketRow & {
  load_id?: number;
  entry_source?: string | null;
  entry_note?: string | null;
  reason_code?: string | null;
  requires_supervisor_approve?: boolean;
};

const MANUAL_NOTE_MIN = 20;

const MANUAL_REASON_OPTIONS: { value: ManualReasonCode; label: string }[] = [
  { value: "SCALE_DOWN", label: "خرابی باسکول (SCALE_DOWN)" },
  { value: "NETWORK", label: "قطع شبکه (NETWORK)" },
  { value: "OTHER", label: "سایر (OTHER)" },
];

const STATUS_OPTIONS = [
  { value: "", label: "همه وضعیت‌ها" },
  { value: "PENDING_EMPTY", label: "PENDING_EMPTY" },
  { value: "EMPTY_REGISTERED", label: "EMPTY_REGISTERED" },
  { value: "LOADED_REGISTERED", label: "LOADED_REGISTERED" },
  { value: "PENDING_HOLD", label: "PENDING_HOLD" },
  { value: "APPROVED", label: "APPROVED" },
  { value: "REJECTED", label: "REJECTED" },
  { value: "ADJUSTED", label: "ADJUSTED" },
] as const;

function canEnterWeight(role: string | undefined) {
  return role === "COOP_OPERATOR" || role === "ADMIN";
}

export default function WeighbridgePage() {
  const { me, can } = useAuthMe();
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [emptyKg, setEmptyKg] = useState("");
  const [loadedKg, setLoadedKg] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [manualReason, setManualReason] = useState<ManualReasonCode>("SCALE_DOWN");
  const [manualNote, setManualNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mineKey, setMineKey] = useState(0);

  const loadTickets = useCallback(async () => {
    if (!getStoredToken()) {
      setErr("توکن تنظیم نشده.");
      setTickets(null);
      return;
    }
    const q = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
    const r = await apiGetData<{ tickets: TicketRow[] }>(`/weighbridge/tickets${q}`);
    if (r.ok) {
      setTickets(r.data.tickets);
      setErr(null);
    } else {
      setTickets(null);
      setErr(r.message);
    }
  }, [statusFilter]);

  const loadDetail = useCallback(async (ticketId: number) => {
    const r = await apiGetData<{ ticket: TicketDetail }>(`/weighbridge/tickets/${ticketId}`);
    if (r.ok) {
      setDetail(r.data.ticket);
      setEmptyKg(r.data.ticket.empty_weight != null ? String(r.data.ticket.empty_weight) : "");
      setLoadedKg(r.data.ticket.loaded_weight != null ? String(r.data.ticket.loaded_weight) : "");
    } else {
      setDetail(null);
      setActionMsg(r.message);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets, mineKey]);

  useEffect(() => {
    if (selectedId == null) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  function selectTicket(t: TicketRow) {
    setSelectedId(t.id);
    setActionMsg(null);
    setRejectReason("");
    setManualNote("");
    setManualReason("SCALE_DOWN");
  }

  async function refreshAll() {
    await loadTickets();
    if (selectedId != null) await loadDetail(selectedId);
  }

  async function submitWeights(e: React.FormEvent) {
    e.preventDefault();
    if (selectedId == null || !detail) return;
    const empty = Number(emptyKg.replace(/,/g, "."));
    const loaded = Number(loadedKg.replace(/,/g, "."));
    if (!Number.isFinite(empty) || !Number.isFinite(loaded) || loaded <= empty) {
      setActionMsg("وزن خالی و پر باید عدد معتبر باشند و وزن پر بزرگ‌تر از خالی.");
      return;
    }
    setBusy("weights");
    setActionMsg(null);
    const r = await apiPostData<{ ticket: TicketRow; anomaly?: boolean }>(
      `/weighbridge/tickets/${selectedId}/weights`,
      { empty_weight: empty, loaded_weight: loaded, entry_source: "OPERATOR" },
    );
    setBusy(null);
    if (!r.ok) {
      setActionMsg(r.message);
      return;
    }
    setDetail((prev) => (prev ? { ...prev, ...r.data.ticket } : prev));
    setActionMsg(
      r.data.anomaly
        ? "وزن ثبت شد — اختلاف ≥۵٪: تیکت در PENDING_HOLD قرار گرفت."
        : "وزن ثبت شد.",
    );
    await refreshAll();
  }

  async function submitManualWeights(e: React.FormEvent) {
    e.preventDefault();
    if (selectedId == null || !detail) return;
    const empty = Number(emptyKg.replace(/,/g, "."));
    const loaded = Number(loadedKg.replace(/,/g, "."));
    const note = manualNote.trim();
    if (!Number.isFinite(empty) || !Number.isFinite(loaded) || loaded <= empty) {
      setActionMsg("وزن خالی و پر باید عدد معتبر باشند و وزن پر بزرگ‌تر از خالی.");
      return;
    }
    if (note.length < MANUAL_NOTE_MIN) {
      setActionMsg(`توضیح ثبت دستی حداقل ${MANUAL_NOTE_MIN} کاراکتر باشد.`);
      return;
    }
    setBusy("manual");
    setActionMsg(null);
    const r = await apiPostData<{ ticket: TicketRow; anomaly?: boolean }>(
      `/weighbridge/tickets/${selectedId}/weights`,
      {
        empty_weight: empty,
        loaded_weight: loaded,
        entry_source: "MANUAL",
        entry_note: note,
        reason_code: manualReason,
      },
    );
    setBusy(null);
    if (!r.ok) {
      setActionMsg(r.message);
      return;
    }
    setDetail((prev) => (prev ? { ...prev, ...r.data.ticket } : prev));
    setActionMsg("ثبت دستی انجام شد — تیکت در PENDING_HOLD؛ تأیید نهایی فقط OPERATION_ADMIN.");
    await refreshAll();
  }

  async function approveTicket() {
    if (selectedId == null) return;
    setBusy("approve");
    setActionMsg(null);
    const r = await apiPostData<{ ticket: TicketRow }>(`/weighbridge/tickets/${selectedId}/approve`, {});
    setBusy(null);
    if (!r.ok) {
      setActionMsg(r.message);
      return;
    }
    setActionMsg("تیکت تأیید شد.");
    await refreshAll();
  }

  async function rejectTicket() {
    if (selectedId == null) return;
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      setActionMsg("دلیل رد حداقل ۳ کاراکتر باشد.");
      return;
    }
    setBusy("reject");
    setActionMsg(null);
    const r = await apiPostData<{ ticket: TicketRow }>(`/weighbridge/tickets/${selectedId}/reject`, { reason });
    setBusy(null);
    if (!r.ok) {
      setActionMsg(r.message);
      return;
    }
    setActionMsg("تیکت رد شد.");
    await refreshAll();
  }

  const weightsEditable =
    detail != null && (detail.status === "PENDING_EMPTY" || detail.status === "EMPTY_REGISTERED");
  const approvable =
    detail != null && (detail.status === "LOADED_REGISTERED" || detail.status === "PENDING_HOLD");
  const isHold = detail?.status === "PENDING_HOLD";
  const needsSupervisor = detail?.requires_supervisor_approve === true;
  const canManualOverride = can("weighbridge:manual_override");
  const canApproveTicket = can("weighbridge:approve");
  const isOpAdmin = me?.role === "OPERATION_ADMIN";
  const approveAllowed =
    approvable && canApproveTicket && (!needsSupervisor || isOpAdmin);

  return (
    <PageFrame
      title="باسکول"
      expectedRoles={["COOP_ADMIN", "COOP_OPERATOR", "OPERATION_ADMIN", "ADMIN"]}
      intro={
        <p style={{ margin: 0 }}>
          ثبت وزن عادی: <strong>COOP_OPERATOR</strong> — ورود دستی (failover): فقط{" "}
          <strong>OPERATION_ADMIN</strong> با دلیل و audit. تأیید نهایی manual:{" "}
          <strong>OPERATION_ADMIN</strong>. راننده وزن وارد نمی‌کند.
        </p>
      }
    >
      <MineScope onMineSelected={() => setMineKey((k) => k + 1)} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
          فیلتر وضعیت
          <select
            data-testid="wb-status-filter"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setSelectedId(null);
            }}
            style={selectStyle}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void loadTickets()} style={btnSecondary}>
          بروزرسانی لیست
        </button>
      </div>

      {err && <div style={alertWarn}>{err}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(300px, 1fr)", gap: 16 }}>
        <section>
          <h3 style={h3}>تیکت‌ها</h3>
          {tickets && tickets.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr style={{ background: "#F3F4F6", textAlign: "right" as const }}>
                    <th style={th}>تیکت</th>
                    <th style={th}>ماموریت</th>
                    <th style={th}>وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr
                      key={t.id}
                      data-testid={`wb-ticket-row-${t.id}`}
                      onClick={() => selectTicket(t)}
                      style={{
                        cursor: "pointer",
                        background: selectedId === t.id ? "#ECFDF5" : undefined,
                      }}
                    >
                      <td style={td}>{t.ticket_number}</td>
                      <td style={td}>{t.mission_id}</td>
                      <td style={td}>{t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tickets && tickets.length === 0 && !err && (
            <p style={{ color: "#6B7280", fontSize: 14 }}>تیکتی برای نمایش نیست.</p>
          )}
        </section>

        <section data-testid="wb-detail-panel">
          <h3 style={h3}>جزئیات تیکت</h3>
          {!selectedId && <p style={{ color: "#6B7280", fontSize: 14 }}>یک تیکت از لیست انتخاب کنید.</p>}
          {detail && (
            <>
              <div style={{ fontSize: 13, color: "#374151", marginBottom: 10, lineHeight: 1.7 }}>
                <div>
                  <strong>{detail.ticket_number}</strong> — ماموریت #{detail.mission_id}
                </div>
                <div>
                  وضعیت: <strong data-testid="wb-ticket-status">{detail.status}</strong>
                </div>
              </div>

              {isHold && needsSupervisor && (
                <div
                  data-testid="wb-manual-supervisor-banner"
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid #DC2626",
                    background: "#FEF2F2",
                    color: "#991B1B",
                    fontSize: 13,
                  }}
                >
                  ثبت <strong>دستی (MANUAL)</strong> — نیاز به تأیید <strong>OPERATION_ADMIN</strong> قبل از VERIFIED.
                </div>
              )}
              {isHold && !needsSupervisor && (
                <div
                  data-testid="wb-hold-banner"
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid #8B7355",
                    background: "#FFFBEB",
                    color: "#92400E",
                    fontSize: 13,
                  }}
                >
                  اختلاف وزن با حجم بار ≥۵٪ — تیکت در حالت <strong>PENDING_HOLD</strong> است. برای ادامه،
                  OPERATION_ADMIN باید آزادسازی (Release) انجام دهد.
                </div>
              )}

              {canManualOverride && (
                <form onSubmit={(e) => void submitManualWeights(e)} style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                    ثبت دستی (Failover) — فقط اپراتور عملیات
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                    <label style={labelBlock}>
                      دلیل
                      <select
                        data-testid="wb-manual-reason"
                        value={manualReason}
                        disabled={!weightsEditable || busy != null}
                        onChange={(e) => setManualReason(e.target.value as ManualReasonCode)}
                        style={selectStyle}
                      >
                        {MANUAL_REASON_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label style={{ ...labelBlock, display: "block", marginBottom: 8 }}>
                    توضیح (حداقل ۲۰ کاراکتر)
                    <textarea
                      data-testid="wb-manual-note"
                      value={manualNote}
                      disabled={!weightsEditable || busy != null}
                      onChange={(e) => setManualNote(e.target.value)}
                      rows={3}
                      style={{ ...inputStyle, minWidth: "100%", resize: "vertical" }}
                    />
                  </label>
                  <button
                    data-testid="wb-submit-manual"
                    type="submit"
                    disabled={!weightsEditable || busy != null}
                    style={{ ...btnPrimary, background: "#B45309", borderColor: "#B45309" }}
                  >
                    {busy === "manual" ? "…" : "ثبت دستی (MANUAL)"}
                  </button>
                </form>
              )}

              {canEnterWeight(me?.role) && (
                <form onSubmit={(e) => void submitWeights(e)} style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>ثبت وزن (kg)</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                    <label style={labelBlock}>
                      وزن خالی
                      <input
                        data-testid="wb-empty-kg"
                        type="text"
                        inputMode="decimal"
                        value={emptyKg}
                        disabled={!weightsEditable || busy != null}
                        onChange={(e) => setEmptyKg(e.target.value)}
                        style={inputStyle}
                        placeholder="empty_kg"
                      />
                    </label>
                    <label style={labelBlock}>
                      وزن پر
                      <input
                        data-testid="wb-loaded-kg"
                        type="text"
                        inputMode="decimal"
                        value={loadedKg}
                        disabled={!weightsEditable || busy != null}
                        onChange={(e) => setLoadedKg(e.target.value)}
                        style={inputStyle}
                        placeholder="loaded_kg"
                      />
                    </label>
                    <label style={labelBlock}>
                      وزن خالص (فقط خواندنی)
                      <input
                        data-testid="wb-net-weight"
                        type="text"
                        readOnly
                        value={detail.net_weight != null ? String(detail.net_weight) : "—"}
                        style={{ ...inputStyle, background: "#F3F4F6", color: "#6B7280" }}
                      />
                    </label>
                  </div>
                  <button
                    data-testid="wb-submit-weights"
                    type="submit"
                    disabled={!weightsEditable || busy != null}
                    style={btnPrimary}
                  >
                    {busy === "weights" ? "…" : "ثبت وزن"}
                  </button>
                  {!weightsEditable && (
                    <span style={{ marginRight: 8, fontSize: 12, color: "#6B7280" }}>
                      ثبت وزن فقط در وضعیت PENDING_EMPTY / EMPTY_REGISTERED.
                    </span>
                  )}
                </form>
              )}

              {needsSupervisor && canApproveTicket && !isOpAdmin && approvable && (
                <p style={{ fontSize: 12, color: "#991B1B", marginBottom: 8 }}>
                  تأیید این تیکت فقط توسط OPERATION_ADMIN امکان‌پذیر است.
                </p>
              )}
              {approveAllowed && (
                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
                  {isHold && isOpAdmin && (
                    <button
                      data-testid="wb-release-hold"
                      type="button"
                      disabled={busy != null}
                      onClick={() => void approveTicket()}
                      style={{ ...btnPrimary, background: "#B45309", borderColor: "#B45309" }}
                    >
                      {busy === "approve" ? "…" : needsSupervisor ? "تأیید دستی (Supervisor)" : "آزادسازی (Release)"}
                    </button>
                  )}
                  {(!isHold || !isOpAdmin) && !needsSupervisor && (
                    <button
                      data-testid="wb-approve"
                      type="button"
                      disabled={busy != null}
                      onClick={() => void approveTicket()}
                      style={btnPrimary}
                    >
                      {busy === "approve" ? "…" : "تأیید (Approve)"}
                    </button>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <input
                      data-testid="wb-reject-reason"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="دلیل رد (حداقل ۳ کاراکتر)"
                      style={{ ...inputStyle, minWidth: 200 }}
                    />
                    <button
                      data-testid="wb-reject"
                      type="button"
                      disabled={busy != null}
                      onClick={() => void rejectTicket()}
                      style={btnDanger}
                    >
                      {busy === "reject" ? "…" : "رد (Reject)"}
                    </button>
                  </div>
                </div>
              )}

              {actionMsg && (
                <div data-testid="wb-action-msg" style={{ marginTop: 12, fontSize: 13, color: "#374151" }}>
                  {actionMsg}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </PageFrame>
  );
}

const h3: React.CSSProperties = { fontSize: 15, marginBottom: 8, marginTop: 0 };
const th: React.CSSProperties = { border: "1px solid #E5E7EB", padding: "8px 10px", fontWeight: 700 };
const td: React.CSSProperties = { border: "1px solid #E5E7EB", padding: "8px 10px" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const selectStyle: React.CSSProperties = {
  display: "block",
  marginTop: 4,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #E5E7EB",
  minWidth: 200,
};
const inputStyle: React.CSSProperties = {
  display: "block",
  marginTop: 4,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #E5E7EB",
  width: "100%",
  minWidth: 120,
};
const labelBlock: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#374151", flex: "1 1 120px" };
const btnPrimary: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #15803d",
  background: "#16a34a",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #D1D5DB",
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
};
const btnDanger: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #B91C1C",
  background: "#DC2626",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
  alignSelf: "flex-start",
};
const alertWarn: React.CSSProperties = { color: "#B45309", marginBottom: 8, fontSize: 14 };
