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
  cooperative_id?: number;
  mine_id?: number;
  created_at: string;
};

export default function AdminUserRequests() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    const res = await apiGetData<{ requests: RequestRow[] }>("/admin/user-provisioning/requests?status=PENDING");
    if (!res.ok) {
      setError(apiErrorMessageFa(res.code, res.message));
      setRequests([]);
      return;
    }
    setError(null);
    setRequests(res.data.requests);
  }, []);

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
      {error && <Alert variant="danger">{error}</Alert>}
      {!error && requests.length === 0 ? (
        <Card>
          <p style={{ margin: 0, color: "#6B7280" }}>درخواست در انتظاری وجود ندارد.</p>
        </Card>
      ) : !error ? (
        requests.map((r) => (
          <Card key={r.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <strong>#{r.id}</strong>
              <Badge>{r.unit_type}</Badge>
              <Badge>{r.target_role}</Badge>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <div>موبایل: {r.mobile_number}</div>
              <div>کد ملی: {r.national_id}</div>
              {r.full_name && <div>نام: {r.full_name}</div>}
              {r.note && <div>یادداشت: {r.note}</div>}
              {r.cooperative_id != null && <div>تعاونی: {r.cooperative_id}</div>}
              {r.mine_id != null && <div>معدن: {r.mine_id}</div>}
            </div>
            {rejectId === r.id ? (
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
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <Button type="button" disabled={busy === r.id} onClick={() => void approve(r.id)}>
                  {busy === r.id ? "…" : "تأیید و ایجاد کاربر"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setRejectId(r.id)}>
                  رد
                </Button>
              </div>
            )}
          </Card>
        ))
      ) : null}
    </PageFrame>
  );
}
