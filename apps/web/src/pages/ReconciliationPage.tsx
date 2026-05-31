import React, { useCallback, useEffect, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { apiGetData, apiPostData } from "../api";

type ReconciliationIssue = {
  id: number;
  run_id: string;
  code: string;
  entity_type: string;
  entity_id: string;
  message: string;
  details?: Record<string, unknown>;
  status: "OPEN" | "RESOLVED";
  resolved_at?: string;
  resolve_reason?: string;
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

const th: React.CSSProperties = { padding: "8px 10px", textAlign: "right" };
const td: React.CSSProperties = { padding: "8px 10px", verticalAlign: "top" };

export default function ReconciliationPage() {
  const [issues, setIssues] = useState<ReconciliationIssue[]>([]);
  const [filter, setFilter] = useState<"OPEN" | "RESOLVED" | "all">("OPEN");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reasonDraft, setReasonDraft] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    const q = filter === "all" ? "" : `?status=${filter}`;
    const res = await apiGetData<{ issues: ReconciliationIssue[] }>(`/admin/reconciliation/issues${q}`);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setIssues(res.data.issues);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolveIssue(id: number) {
    const reason = (reasonDraft[id] ?? "").trim();
    if (!reason) {
      setError("دلیل Resolve الزامی است.");
      return;
    }
    setBusyId(id);
    const res = await apiPostData<{ issue: ReconciliationIssue }>(
      `/admin/reconciliation/issues/${id}/resolve`,
      { reason },
    );
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setReasonDraft((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
    await load();
  }

  return (
    <PageFrame
      title="تطبیق شبانه (RECON-1)"
      expectedRoles={["ADMIN"]}
      intro="مغایرت‌های کیف‌پول، Settlement و Pool پس از اجرای شبانه QUEUE-1. Resolve با ثبت دلیل."
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

      <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 13, color: "#374151" }}>
          فیلتر وضعیت:{" "}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #E5E7EB" }}
          >
            <option value="OPEN">باز (OPEN)</option>
            <option value="RESOLVED">حل‌شده</option>
            <option value="all">همه</option>
          </select>
        </label>
        <button type="button" onClick={() => void load()} style={btnStyle}>
          بروزرسانی
        </button>
        <span style={{ fontSize: 13, color: "#6B7280" }}>{issues.length} مورد</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F3F4F6", textAlign: "right" }}>
              <th style={th}>کد</th>
              <th style={th}>موجودیت</th>
              <th style={th}>پیام</th>
              <th style={th}>run_id</th>
              <th style={th}>وضعیت</th>
              <th style={th}>Resolve</th>
            </tr>
          </thead>
          <tbody>
            {issues.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...td, color: "#6B7280", textAlign: "center" }}>
                  موردی یافت نشد — تطبیق شبانه احتمالاً بدون مغایرت بوده است.
                </td>
              </tr>
            ) : (
              issues.map((i) => (
                <tr key={i.id} style={{ borderBottom: "1px solid #E5E7EB" }}>
                  <td style={td}>
                    <code style={{ fontSize: 11 }}>{i.code}</code>
                  </td>
                  <td style={td}>
                    {i.entity_type} / {i.entity_id}
                  </td>
                  <td style={td}>{i.message}</td>
                  <td style={td}>
                    <code style={{ fontSize: 10 }}>{i.run_id}</code>
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        background: i.status === "OPEN" ? "#FEF3C7" : "#D1FAE5",
                        color: i.status === "OPEN" ? "#92400E" : "#065F46",
                      }}
                    >
                      {i.status}
                    </span>
                    {i.resolve_reason && (
                      <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>{i.resolve_reason}</div>
                    )}
                  </td>
                  <td style={td}>
                    {i.status === "OPEN" ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180 }}>
                        <input
                          type="text"
                          placeholder="دلیل Resolve"
                          value={reasonDraft[i.id] ?? ""}
                          onChange={(e) =>
                            setReasonDraft((d) => ({ ...d, [i.id]: e.target.value }))
                          }
                          style={{
                            padding: "6px 8px",
                            borderRadius: 8,
                            border: "1px solid #E5E7EB",
                            fontSize: 12,
                          }}
                        />
                        <button
                          type="button"
                          disabled={busyId === i.id}
                          onClick={() => void resolveIssue(i.id)}
                          style={{ ...btnStyle, background: "#F3F1EB", color: "#1E3A2F" }}
                        >
                          {busyId === i.id ? "…" : "Resolve"}
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: "#9CA3AF" }}>—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageFrame>
  );
}
