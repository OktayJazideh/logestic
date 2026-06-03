import React, { useCallback, useEffect, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { apiGetData, apiPostData } from "../api";
import { apiErrorMessageFa } from "../lib/apiErrorsFa";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { FormField } from "../components/FormField";
import { FilterField } from "../components/ui/FilterBar";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";

type RequestRow = {
  id: number;
  status: string;
  unit_type: string;
  target_role: string;
  mobile_number: string;
  national_id: string;
  full_name?: string;
  note?: string;
  rejection_reason?: string;
  cooperative_id?: number;
  mine_id?: number;
  reviewed_at?: string;
  created_at: string;
};

type StatusFilter = "PENDING" | "REJECTED" | "APPROVED" | "ALL";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "در انتظار تأیید",
  REJECTED: "رد شده",
  APPROVED: "تأیید شده",
};

export default function AdminUserRequests() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("PENDING");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    const query = statusFilter === "ALL" ? "" : `?status=${statusFilter}`;
    const res = await apiGetData<{ requests: RequestRow[] }>(`/admin/user-provisioning/requests${query}`);
    if (!res.ok) {
      setError(apiErrorMessageFa(res.code, res.message));
      setRequests([]);
      return;
    }
    setError(null);
    setRequests(res.data.requests);
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(id: number) {
    setBusy(id);
    const res = await apiPostData<{ request: RequestRow; user: unknown }>(
      `/admin/user-provisioning/requests/${id}/approve`,
      {},
    );
    setBusy(null);
    if (!res.ok) {
      setError(apiErrorMessageFa(res.code, res.message));
      return;
    }
    await load();
  }

  async function reject(id: number) {
    if (!rejectReason.trim()) {
      setError("دلیل رد را وارد کنید.");
      return;
    }
    setBusy(id);
    const res = await apiPostData<{ request: RequestRow }>(
      `/admin/user-provisioning/requests/${id}/reject`,
      { reason: rejectReason.trim() },
    );
    setBusy(null);
    if (!res.ok) {
      setError(apiErrorMessageFa(res.code, res.message));
      return;
    }
    setRejectId(null);
    setRejectReason("");
    await load();
  }

  return (
    <PageFrame
      title="صندوق درخواست کاربر"
      expectedRoles={["ADMIN"]}
      intro="درخواست‌های ثبت‌شده از تعاونی و عملیات معدن — پس از تأیید، کاربر می‌تواند با OTP وارد شود."
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {(["PENDING", "REJECTED", "APPROVED", "ALL"] as const).map((s) => (
          <Button
            key={s}
            type="button"
            variant={statusFilter === s ? "primary" : "secondary"}
            onClick={() => setStatusFilter(s)}
          >
            {s === "ALL" ? "همه" : STATUS_LABELS[s]}
          </Button>
        ))}
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {!error && requests.length === 0 ? (
        <Card>
          <p style={{ margin: 0, color: "#6B7280" }}>
            {statusFilter === "PENDING"
              ? "درخواست در انتظاری وجود ندارد."
              : statusFilter === "REJECTED"
                ? "درخواست رد‌شده‌ای وجود ندارد."
                : statusFilter === "APPROVED"
                  ? "درخواست تأیید‌شده‌ای وجود ندارد."
                  : "درخواستی ثبت نشده است."}
          </p>
        </Card>
      ) : !error ? (
        requests.map((r) => (
          <Card key={r.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <strong>#{r.id}</strong>
              <Badge>{STATUS_LABELS[r.status] ?? r.status}</Badge>
              <Badge>{r.unit_type}</Badge>
              <Badge>{r.target_role}</Badge>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <div>موبایل: {r.mobile_number}</div>
              <div>کد ملی: {r.national_id}</div>
              {r.full_name && <div>نام: {r.full_name}</div>}
              {r.note && <div>یادداشت: {r.note}</div>}
              {r.rejection_reason && (
                <div style={{ color: "#991B1B", marginTop: 4 }}>
                  <strong>دلیل رد:</strong> {r.rejection_reason}
                </div>
              )}
              {r.reviewed_at && <div style={{ color: "#6B7280" }}>بررسی: {new Date(r.reviewed_at).toLocaleString("fa-IR")}</div>}
              {r.cooperative_id != null && <div>تعاونی: {r.cooperative_id}</div>}
              {r.mine_id != null && <div>معدن: {r.mine_id}</div>}
            </div>
            {r.status === "PENDING" && rejectId === r.id ? (
              <div style={{ marginTop: 12 }}>
                <FilterField minWidth={240}>
                  <FormField label="دلیل رد" required>
                    <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                  </FormField>
                </FilterField>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <Button type="button" variant="secondary" onClick={() => setRejectId(null)}>
                    انصراف
                  </Button>
                  <Button type="button" disabled={busy === r.id} onClick={() => void reject(r.id)}>
                    تأیید رد
                  </Button>
                </div>
              </div>
            ) : r.status === "PENDING" ? (
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <Button type="button" disabled={busy === r.id} onClick={() => void approve(r.id)}>
                  {busy === r.id ? "…" : "تأیید و ایجاد کاربر"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setRejectId(r.id)}>
                  رد
                </Button>
              </div>
            ) : null}
          </Card>
        ))
      ) : null}
    </PageFrame>
  );
}
