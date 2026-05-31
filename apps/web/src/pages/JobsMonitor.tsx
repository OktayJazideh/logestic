import React, { useCallback, useEffect, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { apiGetData, apiPostData } from "../api";

type JobRecord = {
  id: string;
  queue: string;
  job_name: string;
  status: string;
  attempts: number;
  max_attempts: number;
  created_at: string;
  error?: string;
};

type FailedJob = {
  id: number;
  queue_name: string;
  job_name: string;
  error_message: string;
  attempts: number;
  max_attempts: number;
  failed_at: string;
  correlation_id: string | null;
};

type JobsPayload = {
  backend: string;
  queues: string[];
  active: JobRecord[];
  completed: JobRecord[];
  failed: FailedJob[];
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};
const thStyle: React.CSSProperties = {
  textAlign: "right",
  padding: "8px 10px",
  borderBottom: "2px solid #E5E7EB",
  color: "#374151",
};
const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #F3F4F6",
};
const btnStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #E5E7EB",
  background: "#F9FAFB",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};
const btnPrimary: React.CSSProperties = {
  ...btnStyle,
  background: "#1B5E20",
  color: "#fff",
  border: "none",
};

export default function JobsMonitor() {
  const [data, setData] = useState<JobsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [reconBusy, setReconBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await apiGetData<JobsPayload>("/admin/jobs");
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setData(res.data);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  async function retryFailed(id: number) {
    setBusy(id);
    const res = await apiPostData<{ job: JobRecord }>(`/admin/jobs/failed/${id}/retry`, {});
    setBusy(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    await load();
  }

  async function runReconciliation() {
    setReconBusy(true);
    const res = await apiPostData<{ job: JobRecord }>("/admin/jobs/reconciliation/run", {});
    setReconBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    await load();
  }

  return (
    <PageFrame
      title="مانیتور Jobها (QUEUE-1)"
      expectedRoles={["ADMIN", "OPERATION_ADMIN"]}
      intro={
        <>
          صف‌های settlement، notification، reconciliation، event_log — retry نمایی (۳ بار) و ثبت شکست در
          failed_jobs.
          {data ? (
            <>
              {" "}
              بک‌اند: <strong>{data.backend}</strong>
            </>
          ) : null}
        </>
      }
    >
      {error && (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #FCA5A5",
            background: "#FEF2F2",
            color: "#B91C1C",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button type="button" onClick={() => void load()} style={btnStyle}>
          بروزرسانی
        </button>
        <button type="button" onClick={() => void runReconciliation()} disabled={reconBusy} style={btnStyle}>
          {reconBusy ? "در حال اجرا…" : "اجرای Reconciliation"}
        </button>
      </div>

      <Section title={`در حال اجرا (${data?.active.length ?? 0})`}>
        {!data?.active.length ? <p style={emptyStyle}>هیچ job فعالی نیست.</p> : <JobTable jobs={data.active} />}
      </Section>

      <Section title={`شکست‌خورده — failed_jobs (${data?.failed.length ?? 0})`}>
        {!data?.failed.length ? (
          <p style={emptyStyle}>لیست خالی است.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>صف</th>
                <th style={thStyle}>Job</th>
                <th style={thStyle}>تلاش</th>
                <th style={thStyle}>خطا</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {data.failed.map((f) => (
                <tr key={f.id}>
                  <td style={tdStyle}>{f.id}</td>
                  <td style={tdStyle}>{f.queue_name}</td>
                  <td style={tdStyle}>{f.job_name}</td>
                  <td style={tdStyle}>
                    {f.attempts}/{f.max_attempts}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 280, fontSize: 12 }}>{f.error_message}</td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      disabled={busy === f.id}
                      onClick={() => void retryFailed(f.id)}
                      style={btnPrimary}
                    >
                      {busy === f.id ? "…" : "Retry"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`تکمیل‌شده اخیر (${data?.completed.length ?? 0})`}>
        {!data?.completed.length ? <p style={emptyStyle}>—</p> : <JobTable jobs={data.completed} />}
      </Section>
    </PageFrame>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, color: "#374151", marginBottom: 10 }}>{title}</h2>
      {children}
    </div>
  );
}

function JobTable({ jobs }: { jobs: JobRecord[] }) {
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>ID</th>
          <th style={thStyle}>صف</th>
          <th style={thStyle}>Job</th>
          <th style={thStyle}>وضعیت</th>
          <th style={thStyle}>تلاش</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((j) => (
          <tr key={j.id}>
            <td style={{ ...tdStyle, fontSize: 11, fontFamily: "monospace" }}>{j.id.slice(0, 8)}…</td>
            <td style={tdStyle}>{j.queue}</td>
            <td style={tdStyle}>{j.job_name}</td>
            <td style={tdStyle}>{j.status}</td>
            <td style={tdStyle}>
              {j.attempts}/{j.max_attempts}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const emptyStyle: React.CSSProperties = { color: "#9CA3AF", fontSize: 13, margin: 0 };
