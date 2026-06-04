import React, { useCallback, useEffect, useState } from "react";
import { SimplePageLayout } from "../components/simple/SimplePageLayout";
import { ErrorBanner } from "../components/simple/ErrorBanner";
import { breadcrumbsForPath } from "../lib/panelBreadcrumbs";
import { simpleLabel } from "../lib/uiLabels";
import { apiGetData, apiPostData } from "../api";
import { useAuthMe } from "../hooks/useAuthMe";
import { FormField } from "../components/FormField";
import { apiErrorMessageFa } from "../lib/apiErrorsFa";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { FormRow } from "../components/ui/FormRow";
import { FilterField } from "../components/ui/FilterBar";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { PROVISIONING_HINT_FA } from "../lib/identityFieldRules";
import { optionalPersianName, provisioningMobile, runValidators } from "../lib/validation";

type RequestRow = {
  id: number;
  status: string;
  target_role: string;
  mobile_number: string;
  national_id?: string;
  full_name?: string;
  rejection_reason?: string;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "در انتظار تأیید",
  REJECTED: "رد شده",
  APPROVED: "تأیید شده",
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  PENDING: { bg: "#FEF3C7", color: "#92400E" },
  REJECTED: { bg: "#FEE2E2", color: "#991B1B" },
  APPROVED: { bg: "#DCFCE7", color: "#166534" },
};

const COOP_ROLES = ["COOP_ADMIN", "COOP_OPERATOR", "HOUSEHOLD"] as const;
const MINE_ROLES = ["OPERATOR", "OPERATION_ADMIN"] as const;
const PLATFORM_ROLES = ["CONSULTANT", "OPERATOR"] as const;

export default function UserRequestForm() {
  const { me } = useAuthMe();
  const role = me?.role ?? "";
  const isOp = role === "OPERATION_ADMIN";

  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [unitType, setUnitType] = useState<"MINE_OPS" | "PLATFORM_SUPPORT">("MINE_OPS");
  const [targetRole, setTargetRole] = useState("");
  const [mobile, setMobile] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [fullName, setFullName] = useState("");
  const [note, setNote] = useState("");

  const roleOptions: readonly string[] =
    role === "COOP_ADMIN" ? COOP_ROLES : unitType === "MINE_OPS" ? MINE_ROLES : PLATFORM_ROLES;

  const load = useCallback(async () => {
    const res = await apiGetData<{ requests: RequestRow[] }>("/user-provisioning/requests");
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

  useEffect(() => {
    if (!roleOptions.includes(targetRole)) {
      setTargetRole(roleOptions[0] ?? "");
    }
  }, [unitType, role, roleOptions, targetRole]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const mobileErr = runValidators(mobile, [provisioningMobile()]);
    const nameErr = runValidators(fullName, [optionalPersianName("نام")]);
    if (mobileErr || nameErr) {
      setError(mobileErr ?? nameErr ?? null);
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    const body: Record<string, unknown> = {
      target_role: targetRole,
      mobile_number: mobile.trim(),
      full_name: fullName.trim() || undefined,
      note: note.trim() || undefined,
    };
    const nat = nationalId.trim();
    if (nat) body.national_id = nat;
    if (isOp) body.unit_type = unitType;

    const res = await apiPostData<{ request: RequestRow }>("/user-provisioning/requests", body);
    setBusy(false);
    if (!res.ok) {
      setError(apiErrorMessageFa(res.code, res.message));
      return;
    }
    setOk("درخواست ثبت شد و پس از تأیید مدیر سیستم، کاربر فعال می‌شود.");
    setMobile("");
    setNationalId("");
    setFullName("");
    setNote("");
    await load();
  }

  return (
    <SimplePageLayout
      title={simpleLabel("provisioning")}
      subtitle={`پس از تأیید مدیر، کاربر با همان موبایل وارد می‌شود. ${PROVISIONING_HINT_FA}`}
      breadcrumb={breadcrumbsForPath("/panel/user-requests")}
      footer={[
        {
          label: busy ? "در حال ارسال…" : "ارسال درخواست",
          variant: "primary",
          busy,
          disabled: busy,
          type: "submit",
          testId: "user-request-submit",
          onClick: () => {
            const form = document.getElementById("user-request-form") as HTMLFormElement | null;
            form?.requestSubmit();
          },
        },
      ]}
    >
      {error && <ErrorBanner message={error} actionHint="فیلدها را بررسی و دوباره ارسال کنید." onRetry={() => setError(null)} />}
      {ok && <Alert variant="success">{ok}</Alert>}

      <form id="user-request-form" noValidate onSubmit={(e) => void submit(e)}>
      <FormRow>
        {isOp && (
          <FilterField minWidth={160}>
            <FormField label="نوع واحد">
              <select
                value={unitType}
                onChange={(e) => setUnitType(e.target.value as "MINE_OPS" | "PLATFORM_SUPPORT")}
                style={selectStyle}
              >
                <option value="MINE_OPS">عملیات معدن</option>
                <option value="PLATFORM_SUPPORT">پشتیبانی پلتفرم</option>
              </select>
            </FormField>
          </FilterField>
        )}
        <FilterField minWidth={140}>
          <FormField label="نقش">
            <select value={targetRole} onChange={(e) => setTargetRole(e.target.value)} style={selectStyle}>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </FormField>
        </FilterField>
        <FilterField minWidth={140}>
          <FormField label="موبایل" required>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="09xxxxxxxxx" />
          </FormField>
        </FilterField>
        <FilterField minWidth={140}>
          <FormField label="کد ملی (اختیاری)">
            <Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} placeholder="در صورت ورود یکتا" />
          </FormField>
        </FilterField>
        <FilterField minWidth={140}>
          <FormField label="نام (اختیاری، فارسی)">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </FormField>
        </FilterField>
        <FilterField minWidth={160}>
          <FormField label="یادداشت">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
        </FilterField>
      </FormRow>
      </form>

      <h3 style={{ fontSize: 15, marginBottom: 8 }}>درخواست‌های قبلی</h3>
      {requests.length === 0 ? (
        <Card>
          <p style={{ margin: 0, color: "#6B7280" }}>هنوز درخواستی ثبت نشده است.</p>
        </Card>
      ) : (
        requests.map((r) => {
          const statusStyle = STATUS_COLORS[r.status] ?? STATUS_COLORS.PENDING;
          return (
            <Card key={r.id} style={{ marginBottom: 8, fontSize: 13 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 6,
                    fontSize: 12,
                    background: statusStyle.bg,
                    color: statusStyle.color,
                  }}
                >
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
                <Badge>{r.target_role}</Badge>
                <span>{r.mobile_number}</span>
                {r.national_id && <span>{r.national_id}</span>}
                {r.full_name && <span>{r.full_name}</span>}
              </div>
              {r.status === "REJECTED" && r.rejection_reason && (
                <div style={{ color: "#991B1B", marginTop: 4 }}>
                  <strong>دلیل رد:</strong> {r.rejection_reason}
                </div>
              )}
              {r.status === "PENDING" && (
                <div style={{ color: "#6B7280", marginTop: 4 }}>در انتظار تأیید مدیر سیستم</div>
              )}
              {r.status === "APPROVED" && (
                <div style={{ color: "#166534", marginTop: 4 }}>تأیید شد — کاربر می‌تواند با OTP وارد شود.</div>
              )}
            </Card>
          );
        })
      )}
    </SimplePageLayout>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #E5E7EB",
  fontSize: 13,
  width: "100%",
};
