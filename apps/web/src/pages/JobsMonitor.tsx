import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable, type DataTableColumn } from "../components/DataTable";
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

const jobColumns: DataTableColumn<JobRecord>[] = [
  {
    key: "id",
    header: "ID",
    render: (j) => <span style={{ fontFamily: "monospace", fontSize: 11 }}>{j.id.slice(0, 8)}…</span>,
  },
  { key: "queue", header: "صف", render: (j) => j.queue },
  { key: "job", header: "Job", render: (j) => j.job_name },
  { key: "status", header: "وضعیت", render: (j) => j.status },
  {
    key: "attempts",
    header: "تلاش",
    render: (j) => `${j.attempts}/${j.max_attempts}`,
  },
];

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

  const failedColumns = useMemo<DataTableColumn<FailedJob>[]>(
    () => [
      { key: "id", header: "#", render: (f) => f.id },
      { key: "queue", header: "صف", render: (f) => f.queue_name },
      { key: "job", header: "Job", render: (f) => f.job_name },
      {
        key: "attempts",
        header: "تلاش",
        render: (f) => `${f.attempts}/${f.max_attempts}`,
      },
      {
        key: "error",
        header: "خطا",
        render: (f) => <span style={{ fontSize: 12 }}>{f.error_message}</span>,
      },
      {
        key: "actions",
        header: "",
        cardVisible: false,
        render: (f) => (
          <button
            type="button"
            disabled={busy === f.id}
            onClick={() => void retryFailed(f.id)}
            style={btnPrimary}
          >
            {busy === f.id ? "…" : "Retry"}
          </button>
        ),
      },
    ],
    [busy],
  );

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
        {!data?.active.length ? (
          <p style={emptyStyle}>هیچ job فعالی نیست.</p>
        ) : (
          <DataTable
            testId="jobs-active-table"
            rows={data.active}
            rowKey={(j) => j.id}
            columns={jobColumns}
            emptyMessage="هیچ job فعالی نیست."
          />
        )}
      </Section>

      <Section title={`شکست‌خورده — failed_jobs (${data?.failed.length ?? 0})`}>
        {!data?.failed.length ? (
          <p style={emptyStyle}>لیست خالی است.</p>
        ) : (
          <DataTable
            testId="jobs-failed-table"
            rows={data.failed}
            rowKey={(f) => String(f.id)}
            columns={failedColumns}
            emptyMessage="لیست خالی است."
            cardActions={(f) => (
              <button
                type="button"
                disabled={busy === f.id}
                onClick={() => void retryFailed(f.id)}
                style={{ ...btnPrimary, width: "100%" }}
              >
                {busy === f.id ? "…" : "Retry"}
              </button>
            )}
          />
        )}
      </Section>

      <Section title={`تکمیل‌شده اخیر (${data?.completed.length ?? 0})`}>
        {!data?.completed.length ? (
          <p style={emptyStyle}>—</p>
        ) : (
          <DataTable
            testId="jobs-completed-table"
            rows={data.completed}
            rowKey={(j) => j.id}
            columns={jobColumns}
            emptyMessage="—"
          />
        )}
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

const emptyStyle: React.CSSProperties = { color: "#9CA3AF", fontSize: 13, margin: 0 };
