import React, { useCallback, useEffect, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { apiGetData, apiPostData, getStoredToken } from "../api";
import { formatMoney } from "../lib/formatMoney";

type PeriodStatementLine = {
  id: number;
  mission_id: number;
  operational_rial: number;
  community_rial: number;
  verified_net_tons: number;
  load_tracking_code: string | null;
};

type PeriodStatement = {
  id: number;
  mine_id: number;
  cooperative_id: number;
  period_key: string;
  status: string;
  service_count: number;
  total_tons: number;
  operational_rial: number;
  community_rial: number;
  deductions_rial: number;
  payable_rial: number;
  cooperative_payable_iban: string | null;
  mine_payment_reference: string | null;
  mine_paid_at: string | null;
  rejection_reason: string | null;
  mine_payable: boolean;
  mine_paid: boolean;
  lines: PeriodStatementLine[];
  approvals: Array<{ approver_role: string; user_id: number; approved_at: string }>;
  required_approval_roles: string[];
  approval_due_at?: string | null;
  approval_overdue?: boolean;
};

const btn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #D1D5DB",
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
  marginLeft: 8,
};

const btnPrimary: React.CSSProperties = {
  ...btn,
  background: "#0E3B13",
  color: "#fff",
  borderColor: "#0E3B13",
};

export default function PeriodStatementPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [mineId, setMineId] = useState(1);
  const [coopId, setCoopId] = useState(1);
  const [statement, setStatement] = useState<PeriodStatement | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [minePaymentRef, setMinePaymentRef] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!getStoredToken()) return;
    setLoading(true);
    setMsg(null);
    const r = await apiGetData<{ statements: PeriodStatement[] }>(
      `/admin/finance/period-statements?mine_id=${mineId}&cooperative_id=${coopId}&year=${year}&month=${month}`,
    );
    if (r.ok) {
      setStatement(r.data.statements[0] ?? null);
    } else {
      setMsg(r.message);
      setStatement(null);
    }
    setLoading(false);
  }, [year, month, mineId, coopId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(path: string, body?: unknown) {
    if (!getStoredToken()) return;
    setLoading(true);
    setMsg(null);
    const r = await apiPostData<{ statement: PeriodStatement }>(path, body ?? {});
    if (r.ok) {
      setStatement(r.data.statement);
      setMsg("انجام شد");
    } else {
      setMsg(r.message);
    }
    setLoading(false);
  }

  return (
    <PageFrame title="صورت وضعیت دوره (INVOICE-DRAFT-1)">
      <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 16 }}>
        جریان: پیش‌نویس → بررسی → تأیید دوطرفه (تعاونی + عملیات معدن) → قفل مالی. پس از قفل، معدن فقط به IBAN
        رسمی تعاونی واریز می‌کند.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <label>
          سال{" "}
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 72 }} />
        </label>
        <label>
          ماه{" "}
          <input type="number" value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ width: 48 }} />
        </label>
        <label>
          معدن{" "}
          <input type="number" value={mineId} onChange={(e) => setMineId(Number(e.target.value))} style={{ width: 48 }} />
        </label>
        <label>
          تعاونی{" "}
          <input type="number" value={coopId} onChange={(e) => setCoopId(Number(e.target.value))} style={{ width: 48 }} />
        </label>
        <button type="button" style={btn} onClick={() => void load()} disabled={loading}>
          بروزرسانی
        </button>
        <button
          type="button"
          style={btnPrimary}
          disabled={loading}
          onClick={() =>
            void act("/admin/finance/period-statements/draft", {
              mine_id: mineId,
              cooperative_id: coopId,
              year,
              month,
            })
          }
        >
          ایجاد پیش‌نویس
        </button>
      </div>

      {msg && <p style={{ color: msg.includes("خطا") ? "#B91C1C" : "#059669" }}>{msg}</p>}

      {!statement && !loading && <p>صورت وضعیتی برای این دوره یافت نشد — «ایجاد پیش‌نویس» را بزنید.</p>}

      {statement && (
        <div style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <strong>
              #{statement.id} — {statement.period_key} — وضعیت: {statement.status}
            </strong>
            {statement.mine_payable && (
              <span style={{ background: "#DCFCE7", color: "#166534", padding: "4px 10px", borderRadius: 6 }}>
                قابل پرداخت معدن → تعاونی
              </span>
            )}
            {statement.mine_paid && (
              <span style={{ background: "#DBEAFE", color: "#1E40AF", padding: "4px 10px", borderRadius: 6 }}>
                واریز معدن ثبت شد
              </span>
            )}
            {statement.approval_overdue && (
              <span style={{ background: "#FEE2E2", color: "#991B1B", padding: "4px 10px", borderRadius: 6 }}>
                گذشته از مهلت
              </span>
            )}
          </div>

          {statement.approval_due_at && !statement.approval_overdue && (
            <p style={{ marginTop: 8, fontSize: 13, color: "#6B7280" }}>
              مهلت تأیید: {new Date(statement.approval_due_at).toLocaleString("fa-IR")}
            </p>
          )}

          {statement.rejection_reason && (
            <p style={{ color: "#B45309", marginTop: 8 }}>دلیل رد: {statement.rejection_reason}</p>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12, fontSize: 14 }}>
            <span>سرویس: {statement.service_count}</span>
            <span>تناژ: {statement.total_tons}</span>
            <span>عملیاتی: {formatMoney(statement.operational_rial)}</span>
            <span>Community: {formatMoney(statement.community_rial)}</span>
            <span>کسورات: {formatMoney(statement.deductions_rial)}</span>
            <span>
              <strong>قابل پرداخت: {formatMoney(statement.payable_rial)}</strong>
            </span>
          </div>

          {statement.cooperative_payable_iban && (
            <p style={{ marginTop: 8, fontFamily: "monospace" }}>
              IBAN تعاونی (پس از قفل): {statement.cooperative_payable_iban}
            </p>
          )}

          {statement.mine_paid && statement.mine_payment_reference && (
            <p style={{ marginTop: 8, fontSize: 13, color: "#059669" }}>
              پیگیری واریز معدن: {statement.mine_payment_reference}
              {statement.mine_paid_at && ` — ${new Date(statement.mine_paid_at).toLocaleDateString("fa-IR")}`}
            </p>
          )}

          <p style={{ marginTop: 8, fontSize: 13, color: "#6B7280" }}>
            تأییدها:{" "}
            {statement.approvals.length
              ? statement.approvals.map((a) => a.approver_role).join("، ")
              : "—"}{" "}
            / لازم: {statement.required_approval_roles.join(" + ")}
          </p>

          <div style={{ marginTop: 12 }}>
            {statement.status === "DRAFT" && (
              <button
                type="button"
                style={btnPrimary}
                disabled={loading}
                onClick={() => void act(`/admin/finance/period-statements/${statement.id}/submit-review`)}
              >
                ارسال برای بررسی
              </button>
            )}
            {(statement.status === "PENDING_REVIEW" || statement.status === "APPROVED") && (
              <>
                <input
                  placeholder="دلیل رد (اجباری)"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  style={{ padding: 8, minWidth: 220, marginLeft: 8 }}
                />
                <button
                  type="button"
                  style={{ ...btn, color: "#B91C1C" }}
                  disabled={loading || rejectReason.length < 3}
                  onClick={() =>
                    void act(`/admin/finance/period-statements/${statement.id}/reject`, {
                      reason: rejectReason,
                    })
                  }
                >
                  رد
                </button>
                <button
                  type="button"
                  style={btn}
                  disabled={loading}
                  onClick={() => void act(`/admin/finance/period-statements/${statement.id}/approve`)}
                >
                  تأیید (نقش من)
                </button>
              </>
            )}
            {statement.status === "APPROVED" && (
              <button
                type="button"
                style={btnPrimary}
                disabled={loading}
                onClick={() => void act(`/admin/finance/period-statements/${statement.id}/lock`)}
              >
                قفل مالی
              </button>
            )}
            {statement.status === "LOCKED" && !statement.mine_paid && (
              <>
                <input
                  placeholder="شماره پیگیری واریز معدن (حداقل ۸ کاراکتر)"
                  value={minePaymentRef}
                  onChange={(e) => setMinePaymentRef(e.target.value)}
                  style={{ padding: 8, minWidth: 260, marginLeft: 8 }}
                />
                <button
                  type="button"
                  style={btnPrimary}
                  disabled={loading || minePaymentRef.length < 8}
                  onClick={() =>
                    void act(`/admin/finance/period-statements/${statement.id}/register-mine-payment`, {
                      payment_reference: minePaymentRef,
                    })
                  }
                >
                  ثبت واریز معدن
                </button>
              </>
            )}
          </div>

          <table style={{ width: "100%", marginTop: 16, borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F3F4F6" }}>
                <th style={{ padding: 8, textAlign: "right" }}>مأموریت</th>
                <th style={{ padding: 8 }}>بار</th>
                <th style={{ padding: 8 }}>تناژ</th>
                <th style={{ padding: 8 }}>عملیاتی</th>
                <th style={{ padding: 8 }}>Community</th>
              </tr>
            </thead>
            <tbody>
              {statement.lines.map((l) => (
                <tr key={l.id} style={{ borderTop: "1px solid #E5E7EB" }}>
                  <td style={{ padding: 8 }}>{l.mission_id}</td>
                  <td style={{ padding: 8 }}>{l.load_tracking_code ?? "—"}</td>
                  <td style={{ padding: 8 }}>{l.verified_net_tons}</td>
                  <td style={{ padding: 8 }}>{formatMoney(l.operational_rial)}</td>
                  <td style={{ padding: 8 }}>{formatMoney(l.community_rial)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageFrame>
  );
}
