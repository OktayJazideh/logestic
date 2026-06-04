import React, { useCallback, useEffect, useState } from "react";
import { SimplePageLayout } from "../components/simple/SimplePageLayout";
import { ErrorBanner } from "../components/simple/ErrorBanner";
import { StatusBadge } from "../components/simple/StatusBadge";
import { MineScope } from "../components/MineScope";
import { apiGetData, apiPostData, getStoredToken } from "../api";
import { useAuthMe } from "../hooks/useAuthMe";
import { useFieldValidation } from "../hooks/useFieldValidation";
import { fieldErrorStyle } from "../components/FormField";
import { minLength, positiveNumber, required, runValidators } from "../lib/validation";
import { breadcrumbsForPath } from "../lib/panelBreadcrumbs";
import { labelFa, MANUAL_REASON_FA, simpleLabel, WEIGHBRIDGE_STATUS_FA } from "../lib/uiLabels";
import {
  alertStyle,
  brand,
  btnDanger as themeBtnDanger,
  btnPrimary as themeBtnPrimary,
  btnSecondary as themeBtnSecondary,
  inputStyle as themeInput,
  radius,
  selectStyle as themeSelect,
  tableCellPadding,
} from "../theme";

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
  { value: "SCALE_DOWN", label: MANUAL_REASON_FA.SCALE_DOWN },
  { value: "NETWORK", label: MANUAL_REASON_FA.NETWORK },
  { value: "OTHER", label: MANUAL_REASON_FA.OTHER },
];

const STATUS_OPTIONS = [
  { value: "", label: "همه وضعیت‌ها" },
  ...Object.entries(WEIGHBRIDGE_STATUS_FA).map(([value, label]) => ({ value, label })),
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
  const { getError, validateField, mergeErrors } = useFieldValidation();

  function validateWeightPair(empty: string, loaded: string): Record<string, string | undefined> {
    const emptyErr = runValidators(empty, [required("وزن خالی"), positiveNumber("وزن خالی")]);
    const loadedErr = runValidators(loaded, [required("وزن پر"), positiveNumber("وزن پر")]);
    if (!emptyErr && !loadedErr) {
      const e = Number(empty.replace(/,/g, "."));
      const l = Number(loaded.replace(/,/g, "."));
      if (l <= e) {
        return { loadedKg: "وزن پر باید بزرگ‌تر از وزن خالی باشد." };
      }
    }
    return { emptyKg: emptyErr, loadedKg: loadedErr };
  }

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
    const wErrs = validateWeightPair(emptyKg, loadedKg);
    if (wErrs.emptyKg || wErrs.loadedKg) {
      mergeErrors(wErrs);
      setActionMsg(wErrs.loadedKg ?? wErrs.emptyKg ?? "وزن نامعتبر است.");
      return;
    }
    const empty = Number(emptyKg.replace(/,/g, "."));
    const loaded = Number(loadedKg.replace(/,/g, "."));
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
        ? "وزن ثبت شد — اختلاف ≥۵٪: تیکت در انتظار نگهداری قرار گرفت."
        : "وزن ثبت شد.",
    );
    await refreshAll();
  }

  async function submitManualWeights(e: React.FormEvent) {
    e.preventDefault();
    if (selectedId == null || !detail) return;
    const wErrs = validateWeightPair(emptyKg, loadedKg);
    const noteErr = runValidators(manualNote, [required("توضیح"), minLength(MANUAL_NOTE_MIN, "توضیح ثبت دستی")]);
    if (wErrs.emptyKg || wErrs.loadedKg || noteErr) {
      mergeErrors({ ...wErrs, manualNote: noteErr });
      setActionMsg(noteErr ?? wErrs.loadedKg ?? wErrs.emptyKg ?? "ورودی نامعتبر است.");
      return;
    }
    const empty = Number(emptyKg.replace(/,/g, "."));
    const loaded = Number(loadedKg.replace(/,/g, "."));
    const note = manualNote.trim();
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
    setActionMsg("ثبت دستی انجام شد. تیکت در انتظار نگهداری است؛ تأیید نهایی فقط توسط مدیر عملیات.");
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
    const reasonErr = runValidators(reason, [required("دلیل رد"), minLength(3, "دلیل رد")]);
    if (reasonErr) {
      mergeErrors({ rejectReason: reasonErr });
      setActionMsg(reasonErr);
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

  const showWeightForm = canEnterWeight(me?.role) && weightsEditable;
  const showApprovePrimary = approveAllowed && (!isHold || !isOpAdmin || isOpAdmin);
  const primaryApproveLabel =
    isHold && isOpAdmin ? (needsSupervisor ? "تأیید دستی" : "آزادسازی از نگهداری") : "تأیید تیکت";

  return (
    <SimplePageLayout
      title="باسکول"
      subtitle="وزن خالی و پر را ثبت کنید — وزن خالص فقط نمایش داده می‌شود."
      breadcrumb={breadcrumbsForPath("/panel/weighbridge")}
      expectedRoles={["COOP_ADMIN", "COOP_OPERATOR", "OPERATION_ADMIN", "ADMIN"]}
    >
      <MineScope onMineSelected={() => setMineKey((k) => k + 1)} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: brand.textMuted }}>
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

      {err && (
        <ErrorBanner message={err} actionHint="«بروزرسانی لیست» را بزنید." onRetry={() => void loadTickets()} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(300px, 1fr)", gap: 16 }}>
        <section>
          <h3 style={h3}>تیکت‌ها</h3>
          {tickets && tickets.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr style={{ background: brand.surfaceTableHead, textAlign: "right" as const }}>
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
                        background: selectedId === t.id ? brand.successBg : undefined,
                      }}
                    >
                      <td style={td}>{t.ticket_number}</td>
                      <td style={td}>{t.mission_id}</td>
                      <td style={td}>{labelFa(WEIGHBRIDGE_STATUS_FA, t.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tickets && tickets.length === 0 && !err && (
            <p style={{ color: brand.textMuted, fontSize: 14 }}>تیکتی برای نمایش نیست.</p>
          )}
        </section>

        <section data-testid="wb-detail-panel">
          <h3 style={h3}>جزئیات تیکت</h3>
          {!selectedId && <p style={{ color: brand.textMuted, fontSize: 14 }}>یک تیکت از لیست انتخاب کنید.</p>}
          {detail && (
            <>
              <div className="simple-status-hero" data-testid="wb-status-hero">
                <div style={{ fontSize: 14, color: brand.textMuted, marginBottom: 8 }}>
                  {detail.ticket_number} — مأموریت #{detail.mission_id}
                </div>
                <StatusBadge
                  label={labelFa(WEIGHBRIDGE_STATUS_FA, detail.status)}
                  tone={isHold ? "warn" : detail.status === "LOADED_REGISTERED" ? "success" : "primary"}
                  size="lg"
                />
                <div className="simple-status-hero__value" style={{ marginTop: 12 }} data-testid="wb-ticket-status">
                  {detail.net_weight != null
                    ? `${Number(detail.net_weight).toLocaleString("fa-IR")} کیلو — ${simpleLabel("netTons")}`
                    : "وزن خالص هنوز محاسبه نشده"}
                </div>
              </div>

              {isHold && needsSupervisor && (
                <div
                  data-testid="wb-manual-supervisor-banner"
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    borderRadius: 10,
                    ...alertStyle("danger"),
                    border: undefined,
                    fontSize: 13,
                  }}
                >
                  ثبت دستی انجام شده — تأیید نهایی فقط توسط مدیر عملیات.
                </div>
              )}
              {isHold && !needsSupervisor && (
                <div
                  data-testid="wb-hold-banner"
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    borderRadius: 10,
                    ...alertStyle("warn"),
                    border: undefined,
                    fontSize: 13,
                  }}
                >
                  اختلاف وزن با حجم بار بیش از حد مجاز است. تیکت در انتظار نگهداری است؛ مدیر عملیات باید
                  آزادسازی کند.
                </div>
              )}

              {canManualOverride && (
                <form id="wb-manual-form" onSubmit={(e) => void submitManualWeights(e)} style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                    ثبت دستی — فقط مدیر عملیات
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
                </form>
              )}

              {canEnterWeight(me?.role) && (
                <form id="wb-weights-form" onSubmit={(e) => void submitWeights(e)} style={{ marginBottom: 14 }}>
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
                        placeholder="کیلوگرم"
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
                        placeholder="کیلوگرم"
                      />
                    </label>
                    <label style={labelBlock}>
                      وزن خالص (فقط خواندنی)
                      <input
                        data-testid="wb-net-weight"
                        type="text"
                        readOnly
                        value={detail.net_weight != null ? String(detail.net_weight) : "—"}
                        style={{ ...inputStyle, background: brand.surfaceTableHead, color: brand.textMuted }}
                      />
                    </label>
                  </div>
                  {!weightsEditable && (
                    <span style={{ marginRight: 8, fontSize: 12, color: brand.textMuted }}>
                      ثبت وزن فقط وقتی تیکت در انتظار وزن خالی یا وزن خالی ثبت‌شده باشد.
                    </span>
                  )}
                </form>
              )}

              {needsSupervisor && canApproveTicket && !isOpAdmin && approvable && (
                <p style={{ fontSize: 12, color: brand.danger, marginBottom: 8 }}>
                  تأیید این تیکت فقط توسط مدیر عملیات امکان‌پذیر است.
                </p>
              )}
              {approveAllowed && (
                <div style={{ marginTop: 12 }}>
                  <input
                    data-testid="wb-reject-reason"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="دلیل رد (حداقل ۳ کاراکتر)"
                    style={{ ...inputStyle, minWidth: "100%", marginBottom: 8 }}
                  />
                  <button
                    data-testid="wb-reject"
                    type="button"
                    disabled={busy != null}
                    onClick={() => void rejectTicket()}
                    style={{ ...btnDanger, width: "100%", minHeight: 44 }}
                  >
                    {busy === "reject" ? "…" : "رد تیکت"}
                  </button>
                </div>
              )}

              <div className="simple-footer-cta" style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${brand.border}` }}>
                {showWeightForm && (
                  <button
                    data-testid="wb-submit-weights"
                    type="button"
                    disabled={busy != null}
                    className="simple-footer-btn simple-footer-btn--primary"
                    style={{ width: "100%" }}
                    onClick={() => {
                      const form = document.getElementById("wb-weights-form") as HTMLFormElement | null;
                      form?.requestSubmit();
                    }}
                  >
                    {busy === "weights" ? "…" : "ثبت وزن"}
                  </button>
                )}
                {canManualOverride && weightsEditable && !showWeightForm && (
                  <button
                    data-testid="wb-submit-manual"
                    type="button"
                    disabled={busy != null}
                    className="simple-footer-btn simple-footer-btn--danger"
                    style={{ width: "100%" }}
                    onClick={() => {
                      const form = document.getElementById("wb-manual-form") as HTMLFormElement | null;
                      form?.requestSubmit();
                    }}
                  >
                    {busy === "manual" ? "…" : "ثبت دستی"}
                  </button>
                )}
                {showApprovePrimary && !showWeightForm && (
                  <button
                    data-testid={isHold && isOpAdmin ? "wb-release-hold" : "wb-approve"}
                    type="button"
                    disabled={busy != null}
                    className="simple-footer-btn simple-footer-btn--primary"
                    style={{ width: "100%" }}
                    onClick={() => void approveTicket()}
                  >
                    {busy === "approve" ? "…" : primaryApproveLabel}
                  </button>
                )}
              </div>

              {actionMsg && (
                <div data-testid="wb-action-msg" style={{ marginTop: 12, fontSize: 13, color: brand.textMuted }}>
                  {actionMsg}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </SimplePageLayout>
  );
}

const h3: React.CSSProperties = { fontSize: 15, marginBottom: 8, marginTop: 0 };
const th: React.CSSProperties = { border: `1px solid ${brand.border}`, padding: tableCellPadding, fontWeight: 700 };
const td: React.CSSProperties = { border: `1px solid ${brand.border}`, padding: tableCellPadding };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const selectStyle: React.CSSProperties = { ...themeSelect, display: "block", marginTop: 4, minWidth: 200 };
const inputStyle: React.CSSProperties = { ...themeInput, display: "block", marginTop: 4, width: "100%", minWidth: 120 };
const labelBlock: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: brand.textMuted, flex: "1 1 120px" };
const btnPrimary = themeBtnPrimary;
const btnSecondary = themeBtnSecondary;
const btnDanger: React.CSSProperties = { ...themeBtnDanger, alignSelf: "flex-start" };
const alertWarn = alertStyle("warn");
