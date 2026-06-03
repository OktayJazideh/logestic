import React, { useCallback, useEffect, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { JalaliDatePicker } from "../components/JalaliDatePicker";
import { labelFa, ENTITY_TYPE_FA, AUDIT_ACTION_FA } from "../lib/uiLabels";
import { JsonDiffView } from "../components/JsonDiffView";
import { apiGetData } from "../api";
import { formatJalaliDateTime } from "../lib/jalaliDate";
import { dateRange, positiveInt } from "../lib/validation";

type AuditLogItem = {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  before_value: unknown;
  after_value: unknown;
  performed_by_user_id: number | null;
  reason: string | null;
  created_at: string;
};

const btnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #E5E7EB",
  background: "#F9FAFB",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const th: React.CSSProperties = { padding: "8px 10px", textAlign: "right", fontSize: 12 };
const td: React.CSSProperties = { padding: "8px 10px", verticalAlign: "top", fontSize: 12 };

const ENTITY_TYPES = [
  "",
  "household",
  "driver",
  "fleet_owner",
  "vehicle",
  "cooperative",
  "user",
  "membership_objection",
  "kyc_change",
  "mission_payment",
  "weighbridge_ticket",
  "weighbridge_adjustment",
  "rate_card",
  "finance_rule",
  "operation_need",
  "domain_event",
];

export default function AuditViewer() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [filterErr, setFilterErr] = useState<string | null>(null);
  const limit = 30;

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    if (entityType) params.set("entity_type", entityType);
    if (entityId.trim()) params.set("entity_id", entityId.trim());
    if (userId.trim()) params.set("user_id", userId.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const res = await apiGetData<{ logs: AuditLogItem[]; total: number }>(`/audit?${params.toString()}`);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setLogs(res.data.logs);
    setTotal(res.data.total);
  }, [entityType, entityId, userId, from, to, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    if (entityId.trim()) {
      const err = positiveInt("شناسه موجودیت")(entityId.trim());
      if (err) {
        setFilterErr(err);
        return;
      }
    }
    if (userId.trim()) {
      const err = positiveInt("شناسه کاربر")(userId.trim());
      if (err) {
        setFilterErr(err);
        return;
      }
    }
    const rangeErr = dateRange(from, to);
    if (rangeErr) {
      setFilterErr(rangeErr);
      return;
    }
    setFilterErr(null);
    setOffset(0);
  }

  return (
    <PageFrame
      title="مرور Audit (AUDIT-1)"
      expectedRoles={["ADMIN", "COOP_ADMIN"]}
      intro="لاگ دائمی تغییرات برای پاسخ‌گویی حقوقی. ADMIN همهٔ رکوردها؛ COOP_ADMIN فقط در scope تعاونی."
    >
      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #FCA5A5",
            background: "#FEF2F2",
            color: "#991B1B",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {filterErr && (
        <div role="alert" style={{ marginBottom: 12, padding: 12, borderRadius: 10, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#991B1B", fontSize: 13 }}>
          {filterErr}
        </div>
      )}

      <form
        noValidate
        onSubmit={applyFilters}
        style={{
          marginBottom: 16,
          padding: 12,
          borderRadius: 10,
          border: "1px solid #E5E7EB",
          background: "#F9FAFB",
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "flex-end",
        }}
      >
        <JalaliDatePicker label="از تاریخ" value={from} onChange={setFrom} />
        <JalaliDatePicker label="تا تاریخ" value={to} onChange={setTo} />
        <label style={{ fontSize: 12, color: "#374151" }}>
          نوع موجودیت
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            style={{ display: "block", marginTop: 4, padding: "6px 8px", borderRadius: 6, border: "1px solid #D1D5DB", minWidth: 140 }}
          >
            <option value="">همه</option>
            {ENTITY_TYPES.filter(Boolean).map((t) => (
              <option key={t} value={t}>
                {labelFa(ENTITY_TYPE_FA, t)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12, color: "#374151" }}>
          شناسه موجودیت
          <input
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder="مثلاً 42"
            style={{ display: "block", marginTop: 4, padding: "6px 8px", borderRadius: 6, border: "1px solid #D1D5DB", width: 100 }}
          />
        </label>
        <label style={{ fontSize: 12, color: "#374151" }}>
          کاربر (ID)
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="user_id"
            style={{ display: "block", marginTop: 4, padding: "6px 8px", borderRadius: 6, border: "1px solid #D1D5DB", width: 90 }}
          />
        </label>
        <button type="submit" style={btnStyle}>
          اعمال فیلتر
        </button>
        <button type="button" onClick={() => void load()} style={btnStyle}>
          بروزرسانی
        </button>
        <span style={{ fontSize: 12, color: "#6B7280", alignSelf: "center" }}>
          {total} رکورد
        </span>
      </form>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F3F4F6", borderBottom: "1px solid #E5E7EB" }}>
              <th style={th}>زمان</th>
              <th style={th}>موجودیت</th>
              <th style={th}>عمل</th>
              <th style={th}>کاربر</th>
              <th style={th}>دلیل</th>
              <th style={th}>تفاوت</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <React.Fragment key={log.id}>
                <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={td}>{formatJalaliDateTime(log.created_at)}</td>
                  <td style={td}>
                    {labelFa(ENTITY_TYPE_FA, log.entity_type)} / {log.entity_id}
                  </td>
                  <td style={td}>{labelFa(AUDIT_ACTION_FA, log.action)}</td>
                  <td style={td}>{log.performed_by_user_id ?? "—"}</td>
                  <td style={td}>{log.reason ?? "—"}</td>
                  <td style={td}>
                    <button
                      type="button"
                      style={btnStyle}
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      {expandedId === log.id ? "بستن" : "نمایش تفاوت"}
                    </button>
                  </td>
                </tr>
                {expandedId === log.id && (
                  <tr>
                    <td colSpan={6} style={{ padding: 12, background: "#FAFAFA" }}>
                      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12, color: "#374151" }}>
                        before / after (رنگ: قرمز=حذف، سبز=افزودن، خاکستری=بدون تغییر)
                      </div>
                      <JsonDiffView before={log.before_value} after={log.after_value} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 16, textAlign: "center", color: "#6B7280" }}>
                  رکوردی یافت نشد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          disabled={offset <= 0}
          onClick={() => setOffset(Math.max(0, offset - limit))}
          style={btnStyle}
        >
          قبلی
        </button>
        <span style={{ fontSize: 12, color: "#6B7280" }}>
          {offset + 1}–{Math.min(offset + limit, total)} از {total}
        </span>
        <button
          type="button"
          disabled={offset + limit >= total}
          onClick={() => setOffset(offset + limit)}
          style={btnStyle}
        >
          بعدی
        </button>
      </div>
    </PageFrame>
  );
}
