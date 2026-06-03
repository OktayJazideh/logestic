import React, { useCallback, useEffect, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { apiGetData, apiPostData, getStoredToken, pollJobUntilDone, API_BASE } from "../api";
import { formatMoney } from "../lib/formatMoney";
import { JalaliMonthPicker } from "../components/JalaliMonthPicker";
import { formatJalaliDate, formatPeriodKeyYm, todayGregorianYm } from "../lib/jalaliDate";
import {
  COMMUNITY_POOL_STATUS_FA,
  labelFa,
  SETTLEMENT_BATCH_STATUS_FA,
  STATEMENT_STATUS_FA,
} from "../lib/uiLabels";
import { Button } from "../components/ui";
import {
  brand,
  btnPrimary,
  btnSecondary,
  inputStyle as themeInput,
  radius,
  sectionStyle,
  space,
  tableCellPadding,
} from "../theme";

type Batch = {
  id: number;
  status: string;
  mine_id?: number;
  period_start?: string;
  period_end?: string;
  payment_reference?: string | null;
  receipt_file_url?: string | null;
};

type Pool = { id: number; period_key: string; total_amount: number; status: string };

type PeriodStatement = {
  id: number;
  mine_id: number;
  cooperative_id: number;
  period_key: string;
  status: string;
  payable_rial: number;
  cooperative_payable_iban: string | null;
  mine_payment_reference: string | null;
  mine_paid_at: string | null;
  mine_payable: boolean;
  mine_paid: boolean;
  settlement_batch_id: number | null;
};

type Tab = "mine" | "internal";

const inputStyle: React.CSSProperties = {
  ...themeInput,
  marginInlineStart: 6,
  display: "block",
  marginTop: 4,
};

const th: React.CSSProperties = { border: `1px solid ${brand.border}`, padding: tableCellPadding };
const td: React.CSSProperties = { border: `1px solid ${brand.border}`, padding: tableCellPadding };

const tabBtn = (active: boolean): React.CSSProperties => ({
  ...(active ? btnPrimary : btnSecondary),
  fontWeight: active ? 600 : 400,
  fontSize: 13,
  padding: "8px 14px",
});

const btn = btnSecondary;

export default function SettlementPage() {
  const nowYm = todayGregorianYm();
  const [tab, setTab] = useState<Tab>("mine");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [statements, setStatements] = useState<PeriodStatement[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedStatementId, setSelectedStatementId] = useState<number | null>(null);
  const [mineId, setMineId] = useState(1);
  const [coopId, setCoopId] = useState(1);
  const [year, setYear] = useState(nowYm.year);
  const [month, setMonth] = useState(nowYm.month);
  const [paymentRef, setPaymentRef] = useState("");
  const [minePaymentRef, setMinePaymentRef] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiGetData<{ batches: Batch[] }>("/settlement/batches").then((r) => {
      if (r.ok) setBatches(r.data.batches);
      else setErr(r.message);
    });
    apiGetData<{ pools: Pool[] }>("/settlement/community-pools").then((r) => {
      if (r.ok) setPools(r.data.pools);
    });
    apiGetData<{ statements: PeriodStatement[] }>(
      `/admin/finance/period-statements?mine_id=${mineId}&cooperative_id=${coopId}&year=${year}&month=${month}`,
    ).then((r) => {
      if (r.ok) setStatements(r.data.statements);
    });
  }, [mineId, coopId, year, month]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = batches.find((b) => b.id === selectedId);
  const selectedStatement = statements.find((s) => s.id === selectedStatementId);
  const lockedStatements = statements.filter((s) => s.status === "LOCKED");

  async function runAction(label: string, path: string, body?: unknown) {
    setBusy(true);
    setMsg(null);
    setErr(null);
    const r = await apiPostData<{ batch: Batch }>(path, body ?? {});
    setBusy(false);
    if (r.ok) {
      setMsg(`${label}: وضعیت batch = ${r.data.batch.status}`);
      if (r.data.batch.id) setSelectedId(r.data.batch.id);
      load();
    } else {
      setErr(`${label}: ${r.message}`);
    }
  }

  async function monthlyClose() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    const r = await apiPostData<{ job_id: string; batch?: Batch }>("/admin/settlement/monthly-close", {
      mine_id: mineId,
      year,
      month,
    });
    if (!r.ok) {
      setBusy(false);
      setErr(`بستن ماه: ${r.message}`);
      return;
    }
    try {
      const jobId = r.data.job_id;
      if (!jobId) {
        setMsg(`بستن ماه: batch #${r.data.batch?.id} — ${r.data.batch?.status}`);
        if (r.data.batch?.id) setSelectedId(r.data.batch.id);
        load();
        return;
      }
      setMsg("بستن ماه در صف…");
      const job = await pollJobUntilDone(jobId);
      const result = job.result as { batch?: Batch; ok?: boolean };
      if (result?.batch) {
        setMsg(`بستن ماه: batch #${result.batch.id} — ${result.batch.status}`);
        setSelectedId(result.batch.id);
      } else {
        setMsg("بستن ماه انجام شد.");
      }
      load();
    } catch (e) {
      setErr(`بستن ماه: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function registerMinePayment() {
    if (!selectedStatementId) {
      setErr("یک صورت وضعیت قفل‌شده انتخاب کنید.");
      return;
    }
    if (minePaymentRef.length < 8) {
      setErr("شماره پیگیری واریز معدن حداقل ۸ کاراکتر باشد.");
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    const r = await apiPostData<{ statement: PeriodStatement }>(
      `/admin/finance/period-statements/${selectedStatementId}/register-mine-payment`,
      { payment_reference: minePaymentRef },
    );
    setBusy(false);
    if (r.ok) {
      setMsg("واریز معدن ثبت شد — اکنون می‌توانید batch داخلی را Lock کنید.");
      setMinePaymentRef("");
      load();
    } else {
      setErr(`ثبت واریز معدن: ${r.message}`);
    }
  }

  async function exportMinePayment() {
    if (!selectedStatementId) {
      setErr("یک صورت وضعیت انتخاب کنید.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const token = getStoredToken();
      const dl = await fetch(
        `${API_BASE}/admin/finance/period-statements/${selectedStatementId}/export-mine-payment`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!dl.ok) {
        const j = await dl.json().catch(() => ({}));
        setErr((j as { message?: string }).message ?? "دانلود export معدن ناموفق بود.");
        return;
      }
      const blob = await dl.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mine-payment-statement-${selectedStatementId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("فایل پرداخت معدن → تعاونی دانلود شد (فقط شبای تعاونی).");
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function exportInternalExcel() {
    if (!selectedId) {
      setErr("یک batch انتخاب کنید.");
      return;
    }
    setBusy(true);
    setErr(null);
    const queued = await apiPostData<{ job_id: string; download_url: string }>(
      `/admin/settlement/${selectedId}/export`,
      {},
    );
    if (!queued.ok) {
      setBusy(false);
      setErr(`خروجی Excel داخلی: ${queued.message}`);
      return;
    }
    try {
      setMsg("آماده‌سازی Excel تسویه داخلی در صف…");
      await pollJobUntilDone(queued.data.job_id);
      const dl = await fetch(`${API_BASE}/admin/jobs/${queued.data.job_id}/download`, {
        headers: { Authorization: `Bearer ${getStoredToken()}` },
      });
      if (!dl.ok) {
        setErr("دانلود Excel ناموفق بود.");
        return;
      }
      const blob = await dl.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `internal-settlement-batch-${selectedId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("فایل اکسل تسویه داخلی دانلود شد (مالک/خانوار/صندوق جامعه — نه معدن).");
    } catch (e) {
      setErr(`خروجی Excel: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageFrame title="تسویه ماهانه" expectedRoles={["ADMIN", "CONSULTANT", "OPERATION_ADMIN"]}>
      {err && <div style={{ color: "#B45309", marginBottom: 10 }}>{err}</div>}
      {msg && <div style={{ color: "#065F46", marginBottom: 10 }}>{msg}</div>}

      <section
        style={{
          marginBottom: 20,
          padding: 14,
          background: "#F3F1EB",
          borderRadius: 10,
          border: "1px solid #BFDBFE",
        }}
      >
        <h3 style={{ fontSize: 15, marginTop: 0 }}>راهنمای ۳ مرحله‌ای پرداخت</h3>
        <ol style={{ margin: 0, paddingInlineStart: 20, fontSize: 13, lineHeight: 1.8 }}>
          <li>
            <strong>قفل صورت وضعیت</strong> — معدن فقط به شبای رسمی تعاونی واریز می‌کند (تب «پرداخت معدن به
            تعاونی»).
          </li>
          <li>
            <strong>ثبت واریز معدن</strong> — پس از واریز بانکی، شماره پیگیری واریز را ثبت کنید.
          </li>
          <li>
            <strong>تسویه داخلی</strong> — تعاونی/پلتفرم به مالک، خانوار و صندوق جامعه پرداخت می‌کند (تب «تسویه
            داخلی»).
          </li>
        </ol>
      </section>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" style={tabBtn(tab === "mine")} onClick={() => setTab("mine")}>
          پرداخت معدن به تعاونی
        </button>
        <button type="button" style={tabBtn(tab === "internal")} onClick={() => setTab("internal")}>
          تسویه داخلی به ذی‌نفعان
        </button>
      </div>

      {tab === "mine" && (
        <section style={{ ...sectionStyle, marginBottom: space.lg }}>
          <h3 style={{ fontSize: 15, marginTop: 0 }}>صورت وضعیت‌های قفل‌شده — واریز معدن</h3>
          <p style={{ fontSize: 12, color: brand.textMuted }}>
            خروجی این بخش فقط <strong>شبای تعاونی</strong> دارد. معدن به مالک مستقیم واریز نمی‌کند.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
            <label>
              معدن
              <input type="number" value={mineId} onChange={(e) => setMineId(Number(e.target.value))} style={inputStyle} />
            </label>
            <label>
              تعاونی
              <input type="number" value={coopId} onChange={(e) => setCoopId(Number(e.target.value))} style={inputStyle} />
            </label>
            <JalaliMonthPicker
              label="دوره"
              year={year}
              month={month}
              showPeriodHint={false}
              onChange={(y, m) => {
                setYear(y);
                setMonth(m);
              }}
            />
            <button type="button" style={btn} disabled={busy} onClick={load}>
              بروزرسانی
            </button>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 12 }}>
            <thead>
              <tr style={{ background: brand.surfaceTableHead, textAlign: "right" as const }}>
                <th style={th}>انتخاب</th>
                <th style={th}>شناسه</th>
                <th style={th}>دوره</th>
                <th style={th}>مبلغ</th>
                <th style={th}>شبای تعاونی</th>
                <th style={th}>واریز معدن</th>
              </tr>
            </thead>
            <tbody>
              {lockedStatements.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...td, textAlign: "center", color: brand.textMuted }}>
                    صورت وضعیت قفل‌شده برای این دوره یافت نشد
                  </td>
                </tr>
              )}
              {lockedStatements.map((s) => (
                <tr
                  key={s.id}
                  style={{ background: selectedStatementId === s.id ? brand.successBg : undefined, cursor: "pointer" }}
                  onClick={() => setSelectedStatementId(s.id)}
                >
                  <td style={td}>
                    <input type="radio" checked={selectedStatementId === s.id} readOnly />
                  </td>
                  <td style={td}>{s.id}</td>
                  <td style={td}>{formatPeriodKeyYm(s.period_key)}</td>
                  <td style={td}>{formatMoney(s.payable_rial)}</td>
                  <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>{s.cooperative_payable_iban ?? "—"}</td>
                  <td style={td}>
                    {s.mine_paid ? (
                      <span style={{ color: brand.success }}>✓ {s.mine_payment_reference}</span>
                    ) : (
                      <span style={{ color: "#B45309" }}>در انتظار</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <input
              value={minePaymentRef}
              onChange={(e) => setMinePaymentRef(e.target.value)}
              placeholder="شماره پیگیری واریز معدن (حداقل ۸ کاراکتر)"
              style={{ ...inputStyle, width: 280, marginInlineStart: 0 }}
            />
            <button
              type="button"
              style={btnPrimary}
              disabled={busy || !selectedStatementId || selectedStatement?.mine_paid}
              onClick={() => void registerMinePayment()}
            >
              ثبت واریز معدن
            </button>
            <button
              type="button"
              style={btn}
              disabled={busy || !selectedStatementId}
              onClick={() => void exportMinePayment()}
            >
              خروجی اکسل (معدن → تعاونی)
            </button>
          </div>
        </section>
      )}

      {tab === "internal" && (
        <>
          <section style={{ ...sectionStyle, marginBottom: space.lg }}>
            <h3 style={{ fontSize: 15, marginTop: 0 }}>۱. بستن ماه</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label>
                معدن
                <input type="number" value={mineId} onChange={(e) => setMineId(Number(e.target.value))} style={inputStyle} />
              </label>
              <JalaliMonthPicker
                label="دوره"
                year={year}
                month={month}
                onChange={(y, m) => {
                  setYear(y);
                  setMonth(m);
                }}
              />
              <button type="button" style={btnPrimary} disabled={busy} onClick={() => void monthlyClose()}>
                بستن ماه
              </button>
            </div>
          </section>

          <section style={{ ...sectionStyle, marginBottom: space.lg }}>
            <h3 style={{ fontSize: 15, marginTop: 0 }}>۲. تسویه داخلی — batch انتخاب‌شده</h3>
            <p style={{ fontSize: 12, color: brand.textMuted }}>
              پرداخت‌کننده: تعاونی/پلتفرم — نه معدن. ذی‌نفعان: مالک ناوگان، خانوار، صندوق جامعه. قبل از قفل، واریز
              معدن باید ثبت شده باشد.
            </p>
            <p style={{ fontSize: 12, color: brand.textMuted }}>
              جریان: محاسبه‌شده → قفل (پس از واریز معدن) → آماده → ارسال به بانک → در صف بانک → علامت پرداخت‌شده →
              تسویه‌شده
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <button
                type="button"
                style={btn}
                disabled={busy || !selectedId}
                onClick={() => void runAction("قفل", `/admin/settlement/${selectedId}/lock`)}
              >
                قفل
              </button>
              <button
                type="button"
                style={btn}
                disabled={busy || !selectedId}
                onClick={() => void runAction("ارسال به بانک (داخلی)", `/admin/settlement/${selectedId}/send-to-bank`)}
              >
                ارسال به بانک (داخلی)
              </button>
              <button type="button" style={btn} disabled={busy || !selectedId} onClick={() => void exportInternalExcel()}>
                خروجی اکسل (تسویه داخلی)
              </button>
            </div>

            <div style={{ display: "grid", gap: 8, maxWidth: 520 }}>
              <input
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="شماره پیگیری بانکی (حداقل ۸ کاراکتر)"
                style={{ ...inputStyle, width: "100%", marginInlineStart: 0 }}
              />
              <input
                value={receiptUrl}
                onChange={(e) => setReceiptUrl(e.target.value)}
                placeholder="آدرس رسید (URL)"
                style={{ ...inputStyle, width: "100%", marginInlineStart: 0 }}
              />
              <button
                type="button"
                style={btnPrimary}
                disabled={busy || !selectedId}
                onClick={() => {
                  if (!selectedId) return;
                  if (paymentRef.length < 8) {
                    setErr("شماره پیگیری بانکی حداقل ۸ کاراکتر باشد.");
                    return;
                  }
                  if (!receiptUrl.trim()) {
                    setErr("آدرس رسید (URL) الزامی است.");
                    return;
                  }
                  void runAction("ثبت پرداخت داخلی", `/admin/settlement/${selectedId}/mark-paid`, {
                    payment_reference: paymentRef,
                    receipt_file_url: receiptUrl,
                  });
                }}
              >
                Mark-Paid (داخلی)
              </button>
            </div>
            {selected && (
              <p style={{ fontSize: 12, marginTop: 8 }}>
                batch #{selected.id} — <strong>{selected.status}</strong>
                {selected.payment_reference && ` — ref: ${selected.payment_reference}`}
              </p>
            )}
          </section>

          <h3 style={{ fontSize: 15 }}>Batchها</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
            <thead>
              <tr style={{ background: brand.surfaceTableHead, textAlign: "right" as const }}>
                <th style={th}>انتخاب</th>
                <th style={th}>شناسه</th>
                <th style={th}>وضعیت</th>
                <th style={th}>دوره</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr
                  key={b.id}
                  style={{ background: selectedId === b.id ? brand.successBg : undefined, cursor: "pointer" }}
                  onClick={() => setSelectedId(b.id)}
                >
                  <td style={td}>
                    <input type="radio" checked={selectedId === b.id} readOnly />
                  </td>
                  <td style={td}>{b.id}</td>
                  <td style={td}>{labelFa(SETTLEMENT_BATCH_STATUS_FA, b.status)}</td>
                  <td style={td}>
                    {b.period_start ? formatJalaliDate(b.period_start) : "—"} تا{" "}
                    {b.period_end ? formatJalaliDate(b.period_end) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ fontSize: 15 }}>صندوق جامعه</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: brand.surfaceTableHead, textAlign: "right" as const }}>
                <th style={th}>دوره</th>
                <th style={th}>جمع</th>
                <th style={th}>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((p) => (
                <tr key={p.id}>
                  <td style={td}>{formatPeriodKeyYm(p.period_key)}</td>
                  <td style={td}>{formatMoney(Number(p.total_amount))}</td>
                  <td style={td}>
                    {labelFa(COMMUNITY_POOL_STATUS_FA, p.status)}
                    {p.status === "SNAPSHOT_LOCKED" && (
                      <button
                        type="button"
                        style={{ ...btn, marginInlineStart: 8, padding: "4px 8px" }}
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          const r = await apiPostData<{ job_id: string }>(
                            `/admin/settlement/community-pools/${p.id}/distribute`,
                            {},
                          );
                          setBusy(false);
                          if (!r.ok) {
                            setErr(r.message);
                            return;
                          }
                          try {
                            await pollJobUntilDone(r.data.job_id);
                            setMsg(`توزیع pool ${p.period_key} انجام شد.`);
                            load();
                          } catch (e) {
                            setErr(String(e));
                          }
                        }}
                      >
                        Distribute
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </PageFrame>
  );
}
