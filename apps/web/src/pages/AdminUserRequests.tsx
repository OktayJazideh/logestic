import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SimplePageLayout } from "../components/simple/SimplePageLayout";
import { ErrorBanner } from "../components/simple/ErrorBanner";
import { breadcrumbsForPath } from "../lib/panelBreadcrumbs";
import { simpleLabel } from "../lib/uiLabels";
import { apiGetData, apiPostData } from "../api";
import { apiErrorMessageFa } from "../lib/apiErrorsFa";
import { ADMIN_USER_ROLES, roleLabelFa, roleOptionsFa } from "../lib/roleLabels";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { FormField } from "../components/FormField";
import { FilterField } from "../components/ui/FilterBar";
import { FormRow } from "../components/ui/FormRow";
import { Input, Select } from "../components/ui";
import { Badge } from "../components/ui/Badge";

type RequestRow = {
  id: number;
  status: string;
  unit_type: string;
  target_role: string;
  mobile_number: string;
  national_id?: string;
  bank_iban?: string;
  full_name?: string;
  note?: string;
  rejection_reason?: string;
  cooperative_id?: number;
  cooperative_name?: string;
  mine_id?: number;
  mine_name?: string;
  mine_code?: string;
  village_id?: number;
  village_name?: string;
  reviewed_at?: string;
  created_at: string;
};

type VillageRow = { id: number; name: string; mine_id: number };
type MineCatalogRow = {
  id: number;
  mine_code: string;
  name: string;
  cooperatives: { id: number; name: string; mine_id: number }[];
  villages: VillageRow[];
};

type StatusFilter = "PENDING" | "REJECTED" | "APPROVED" | "ALL";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "در انتظار تأیید",
  REJECTED: "رد شده",
  APPROVED: "تأیید شده",
};

const UNIT_LABELS: Record<string, string> = {
  COOPERATIVE: "تعاونی",
  MINE_OPS: "عملیات معدن",
  PLATFORM_SUPPORT: "پشتیبانی پلتفرم",
};

const ROLE_OPTIONS = roleOptionsFa(ADMIN_USER_ROLES);

function buildQuery(filters: {
  status: StatusFilter;
  mine: string;
  coop: string;
  village: string;
  role: string;
  q: string;
}) {
  const p = new URLSearchParams();
  if (filters.status !== "ALL") p.set("status", filters.status);
  if (filters.mine) p.set("mine_id", filters.mine);
  if (filters.coop) p.set("cooperative_id", filters.coop);
  if (filters.village) p.set("village_id", filters.village);
  if (filters.role) p.set("role", filters.role);
  if (filters.q.trim()) p.set("q", filters.q.trim());
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export default function AdminUserRequests() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [mines, setMines] = useState<MineCatalogRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("PENDING");
  const [filterMine, setFilterMine] = useState("");
  const [filterCoop, setFilterCoop] = useState("");
  const [filterVillage, setFilterVillage] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterQ, setFilterQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const filterCoops = useMemo(
    () => mines.find((m) => String(m.id) === filterMine)?.cooperatives ?? [],
    [mines, filterMine],
  );
  const filterVillages = useMemo(
    () => mines.find((m) => String(m.id) === filterMine)?.villages ?? [],
    [mines, filterMine],
  );

  const loadMines = useCallback(async () => {
    const res = await apiGetData<{ mines: MineCatalogRow[] }>("/admin/mines");
    if (res.ok) setMines(res.data.mines);
  }, []);

  const load = useCallback(async () => {
    const qs = buildQuery({
      status: statusFilter,
      mine: filterMine,
      coop: filterCoop,
      village: filterVillage,
      role: filterRole,
      q: filterQ,
    });
    const res = await apiGetData<{ requests: RequestRow[] }>(`/admin/user-provisioning/requests${qs}`);
    if (!res.ok) {
      setError(apiErrorMessageFa(res.code, res.message));
      setRequests([]);
      return;
    }
    setError(null);
    setRequests(res.data.requests);
  }, [statusFilter, filterMine, filterCoop, filterVillage, filterRole, filterQ]);

  useEffect(() => {
    void loadMines();
  }, [loadMines]);

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
    <SimplePageLayout
      title={`صندوق ${simpleLabel("provisioning")}`}
      subtitle="درخواست‌های جدید را با جزئیات معدن/تعاونی/روستا بررسی و تأیید یا رد کنید."
      breadcrumb={breadcrumbsForPath("/panel/admin/user-requests")}
      expectedRoles={["ADMIN"]}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
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

      <Card style={{ marginBottom: 16 }}>
        <FormRow>
          <FilterField minWidth={140}>
            <FormField label="فیلتر معدن">
              <Select
                value={filterMine}
                onChange={(e) => {
                  setFilterMine(e.target.value);
                  setFilterCoop("");
                  setFilterVillage("");
                }}
              >
                <option value="">همه</option>
                {mines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </FilterField>
          <FilterField minWidth={140}>
            <FormField label="فیلتر تعاونی">
              <Select value={filterCoop} onChange={(e) => setFilterCoop(e.target.value)} disabled={!filterMine}>
                <option value="">همه</option>
                {filterCoops.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </FilterField>
          <FilterField minWidth={140}>
            <FormField label="فیلتر روستا">
              <Select value={filterVillage} onChange={(e) => setFilterVillage(e.target.value)} disabled={!filterMine}>
                <option value="">همه</option>
                {filterVillages.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </FilterField>
          <FilterField minWidth={140}>
            <FormField label="فیلتر نقش">
              <Select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
                <option value="">همه</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </FilterField>
          <FilterField minWidth={160}>
            <FormField label="جستجو">
              <Input value={filterQ} onChange={(e) => setFilterQ(e.target.value)} placeholder="موبایل، کد ملی…" />
            </FormField>
          </FilterField>
          <FilterField minWidth={80}>
            <FormField label=" ">
              <Button type="button" onClick={() => void load()}>
                اعمال
              </Button>
            </FormField>
          </FilterField>
        </FormRow>
      </Card>

      {error && <ErrorBanner message={error} actionHint="دوباره تلاش کنید." onRetry={() => void load()} />}
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
              <Badge>{UNIT_LABELS[r.unit_type] ?? r.unit_type}</Badge>
              <Badge>{roleLabelFa(r.target_role)}</Badge>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <div>موبایل: {r.mobile_number}</div>
              <div>کد ملی: {r.national_id ?? "—"}</div>
              <div>شبا: {r.bank_iban ?? "—"}</div>
              {r.full_name && <div>نام: {r.full_name}</div>}
              <div>
                معدن: {r.mine_name ? `${r.mine_name} (${r.mine_code ?? r.mine_id})` : r.mine_id ?? "—"}
              </div>
              <div>تعاونی: {r.cooperative_name ?? r.cooperative_id ?? "—"}</div>
              <div>روستا: {r.village_name ?? r.village_id ?? "—"}</div>
              {r.note && <div>یادداشت: {r.note}</div>}
              {r.rejection_reason && (
                <div style={{ color: "#991B1B", marginTop: 4 }}>
                  <strong>دلیل رد:</strong> {r.rejection_reason}
                </div>
              )}
              {r.reviewed_at && (
                <div style={{ color: "#6B7280" }}>بررسی: {new Date(r.reviewed_at).toLocaleString("fa-IR")}</div>
              )}
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
    </SimplePageLayout>
  );
}
