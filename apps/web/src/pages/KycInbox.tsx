import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SimplePageLayout } from "../components/simple/SimplePageLayout";
import { SimpleConfirmDialog } from "../components/simple/SimpleConfirmDialog";
import { breadcrumbsForPath } from "../lib/panelBreadcrumbs";
import { simpleLabel } from "../lib/uiLabels";
import { JalaliDatePicker } from "../components/JalaliDatePicker";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { apiGetData, apiPostData } from "../api";
import { formatJalaliDate } from "../lib/jalaliDate";
import { alertStyle, brand, btnPrimary, btnSecondary, inputStyle, radius, shadow, space } from "../theme";
import { Button } from "../components/ui";

type InboxStatus = "PENDING" | "NEEDS_CORRECTION";
type EntityType = "household" | "driver" | "fleet_owner" | "vehicle";

type VillageRow = { id: number; name: string; district?: string };

type InboxItem = {
  id: number;
  entity_type: EntityType;
  name: string;
  national_id: string | null;
  village_id: number | null;
  village_name: string | null;
  status: string;
  created_at: string;
  cooperative_id: number;
  correction_reason?: string;
  charter_file_url?: string | null;
  license_file_url?: string | null;
  identity_file_url?: string | null;
  ownership_doc_url?: string | null;
  insurance_doc_url?: string | null;
};

type InboxResponse = {
  items: InboxItem[];
  total: number;
  page: number;
  limit: number;
  status: InboxStatus;
};

const BULK_MAX = 20;

const kindLabel: Record<EntityType, string> = {
  household: "خانوار",
  driver: "راننده",
  fleet_owner: "مالک ناوگان",
  vehicle: "خودرو",
};

const pathFor: Record<EntityType, string> = {
  household: "households",
  driver: "drivers",
  fleet_owner: "fleet_owners",
  vehicle: "vehicles",
};

const entityTypeOptions: Array<{ value: "" | EntityType; label: string }> = [
  { value: "", label: "همه انواع" },
  { value: "household", label: "خانوار" },
  { value: "driver", label: "راننده" },
  { value: "fleet_owner", label: "مالک ناوگان" },
  { value: "vehicle", label: "خودرو" },
];

const statusBadge: Record<string, { bg: string; color: string; label: string }> = {
  PENDING: { bg: brand.warnBg, color: brand.warn, label: "در انتظار" },
  NEEDS_CORRECTION: { bg: brand.dangerBg, color: brand.danger, label: "نیاز به اصلاح" },
  APPROVED: { bg: brand.successBg, color: brand.success, label: "تأیید شده" },
};

function rowKey(item: InboxItem) {
  return `${item.entity_type}-${item.id}`;
}

function formatDate(iso: string) {
  return formatJalaliDate(iso);
}

function docLinks(item: InboxItem) {
  const links: Array<{ url: string; label: string }> = [];
  if (item.charter_file_url) links.push({ url: item.charter_file_url, label: "سند" });
  if (item.license_file_url) links.push({ url: item.license_file_url, label: "گواهینامه" });
  if (item.identity_file_url && item.identity_file_url !== item.charter_file_url) {
    links.push({ url: item.identity_file_url, label: "هویت" });
  }
  if (item.ownership_doc_url && item.ownership_doc_url !== item.charter_file_url) {
    links.push({ url: item.ownership_doc_url, label: "مالکیت" });
  }
  if (item.insurance_doc_url) links.push({ url: item.insurance_doc_url, label: "بیمه" });
  return links;
}

export default function KycInbox() {
  const [inboxStatus, setInboxStatus] = useState<InboxStatus>("PENDING");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [sortField, setSortField] = useState<"created_at" | "name" | "status">("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [villageFilter, setVillageFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState<"" | EntityType>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [villages, setVillages] = useState<VillageRow[]>([]);

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [correctionModal, setCorrectionModal] = useState<InboxItem | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    apiGetData<{ villages: VillageRow[] }>("/villages").then((r) => {
      if (r.ok) setVillages(r.data.villages);
    });
  }, []);

  const load = useCallback(async () => {
    const q = new URLSearchParams({
      status: inboxStatus,
      page: String(page),
      limit: String(limit),
      sort: `${sortField}:${sortDir}`,
    });
    if (villageFilter) q.set("village_id", villageFilter);
    if (entityTypeFilter) q.set("entity_type", entityTypeFilter);
    if (fromDate) q.set("from_date", fromDate);
    if (toDate) q.set("to_date", toDate);

    const r = await apiGetData<InboxResponse>(`/coop/kyc/inbox?${q.toString()}`);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setErr(null);
    setItems(r.data.items);
    setTotal(r.data.total);
    setSelected(new Set());
  }, [inboxStatus, page, limit, sortField, sortDir, villageFilter, entityTypeFilter, fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleSort(field: string) {
    if (field !== "created_at" && field !== "name" && field !== "status") return;
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "created_at" ? "desc" : "asc");
    }
    setPage(1);
  }

  function toggleRow(key: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        if (next.size >= BULK_MAX) {
          setErr(`حداکثر ${BULK_MAX} مورد برای تأیید گروهی قابل انتخاب است.`);
          return prev;
        }
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    const keys = items.slice(0, BULK_MAX).map(rowKey);
    if (items.length > BULK_MAX) {
      setErr(`فقط ${BULK_MAX} مورد اول انتخاب شد (حداکثر bulk).`);
    }
    setSelected(new Set(keys));
  }

  async function act(item: InboxItem, action: "approve" | "reject" | "suspend") {
    const key = `${item.entity_type}-${item.id}-${action}`;
    if (action !== "approve") {
      const reason = reasons[rowKey(item)]?.trim();
      if (!reason || reason.length < 3) {
        setErr("برای رد یا تعلیق، دلیل حداقل ۳ کاراکتر وارد کنید.");
        return;
      }
    }
    setBusy(key);
    setErr(null);
    const base = `/coop/${pathFor[item.entity_type]}/${item.id}/${action}`;
    const r =
      action === "approve"
        ? await apiPostData<unknown>(base, {})
        : await apiPostData<unknown>(base, { reason: reasons[rowKey(item)] });
    setBusy(null);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    await load();
  }

  async function requestCorrection() {
    if (!correctionModal) return;
    const reason = correctionReason.trim();
    if (reason.length < 10) {
      setErr("دلیل درخواست اصلاح باید حداقل ۱۰ کاراکتر باشد.");
      return;
    }
    const key = `${correctionModal.entity_type}-${correctionModal.id}-correction`;
    setBusy(key);
    setErr(null);
    const r = await apiPostData<unknown>(
      `/coop/${pathFor[correctionModal.entity_type]}/${correctionModal.id}/request-correction`,
      { reason },
    );
    setBusy(null);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setCorrectionModal(null);
    setCorrectionReason("");
    await load();
  }

  async function bulkApprove() {
    const selectedItems = items.filter((i) => selected.has(rowKey(i)));
    if (selectedItems.length === 0) return;
    if (selectedItems.length > BULK_MAX) {
      setErr(`حداکثر ${BULK_MAX} مورد — از API batch استفاده نشده است.`);
      return;
    }
    setBulkConfirm(false);
    setBulkProgress({ done: 0, total: selectedItems.length });
    setErr(null);
    for (let i = 0; i < selectedItems.length; i++) {
      const item = selectedItems[i]!;
      const r = await apiPostData<unknown>(`/coop/${pathFor[item.entity_type]}/${item.id}/approve`, {});
      if (!r.ok) {
        setErr(`خطا در تأیید ${kindLabel[item.entity_type]} #${item.id}: ${r.message}`);
        setBulkProgress(null);
        await load();
        return;
      }
      setBulkProgress({ done: i + 1, total: selectedItems.length });
    }
    setBulkProgress(null);
    await load();
  }

  const columns: DataTableColumn<InboxItem>[] = useMemo(() => {
    const cols: DataTableColumn<InboxItem>[] = [
      {
        key: "name",
        header: "نام",
        sortable: true,
        sortKey: "name",
        render: (item) => item.name,
      },
      {
        key: "national_id",
        header: "کدملی",
        render: (item) => item.national_id ?? "—",
      },
      {
        key: "village",
        header: "روستا",
        render: (item) => item.village_name ?? "—",
      },
      {
        key: "entity_type",
        header: "نوع",
        render: (item) => kindLabel[item.entity_type],
      },
      {
        key: "status",
        header: "وضعیت",
        sortable: true,
        sortKey: "status",
        render: (item) => <StatusBadge status={item.status} />,
      },
      {
        key: "created_at",
        header: "تاریخ",
        sortable: true,
        sortKey: "created_at",
        render: (item) => formatDate(item.created_at),
      },
      {
        key: "docs",
        header: "مدارک",
        render: (item) => {
          const links = docLinks(item);
          if (links.length === 0) return "—";
          return (
            <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
              {links.map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={l.label}
                  aria-label={l.label}
                  style={{ color: "#1E3A2F", fontSize: 16 }}
                >
                  📎
                </a>
              ))}
            </span>
          );
        },
      },
    ];

    if (inboxStatus === "NEEDS_CORRECTION") {
      cols.splice(5, 0, {
        key: "correction_reason",
        header: "دلیل اصلاح",
        render: (item) => (
          <span style={{ color: "#C2410C", fontSize: 12 }}>{item.correction_reason ?? "—"}</span>
        ),
      });
    } else {
      cols.push({
        key: "reject_reason",
        header: "دلیل (رد/تعلیق)",
        render: (item) => (
          <input
            type="text"
            placeholder="دلیل…"
            value={reasons[rowKey(item)] ?? ""}
            onChange={(e) => setReasons((prev) => ({ ...prev, [rowKey(item)]: e.target.value }))}
            style={{ width: "100%", padding: 6, fontSize: 12, boxSizing: "border-box" }}
          />
        ),
      });
    }

    cols.push({
      key: "actions",
      header: "اقدام",
      render: (item) => (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {inboxStatus === "PENDING" && (
            <>
              <ActionBtn
                label="تأیید"
                color="#166534"
                disabled={busy !== null || bulkProgress !== null}
                loading={busy === `${item.entity_type}-${item.id}-approve`}
                onClick={() => act(item, "approve")}
              />
              <ActionBtn
                label="رد"
                color="#B45309"
                disabled={busy !== null || bulkProgress !== null}
                loading={busy === `${item.entity_type}-${item.id}-reject`}
                onClick={() => act(item, "reject")}
              />
              <ActionBtn
                label="تعلیق"
                color="#991B1B"
                disabled={busy !== null || bulkProgress !== null}
                loading={busy === `${item.entity_type}-${item.id}-suspend`}
                onClick={() => act(item, "suspend")}
              />
              <ActionBtn
                label="درخواست اصلاح"
                color="#C2410C"
                disabled={busy !== null || bulkProgress !== null}
                loading={busy === `${item.entity_type}-${item.id}-correction`}
                onClick={() => {
                  setCorrectionModal(item);
                  setCorrectionReason("");
                  setErr(null);
                }}
              />
            </>
          )}
          {inboxStatus === "NEEDS_CORRECTION" && (
            <span style={{ fontSize: 12, color: "#6B7280" }}>منتظر resubmit متقاضی</span>
          )}
        </div>
      ),
    });

    return cols;
  }, [inboxStatus, reasons, busy, bulkProgress]);

  const title =
    inboxStatus === "PENDING" ? "صندوق احراز هویت — در انتظار تأیید" : "صندوق احراز هویت — نیاز به اصلاح";

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <SimplePageLayout
      title={simpleLabel("kyc")}
      subtitle={
        inboxStatus === "PENDING"
          ? "درخواست‌های در انتظار را تأیید یا رد کنید — دلیل رد الزامی است."
          : "درخواست‌های نیاز به اصلاح را پیگیری کنید."
      }
      breadcrumb={breadcrumbsForPath("/panel/kyc")}
      expectedRoles={["COOP_ADMIN", "COOP_OPERATOR", "ADMIN"]}
    >
      <InboxTabs
        inboxStatus={inboxStatus}
        onChange={(s) => {
          setInboxStatus(s);
          setPage(1);
          setCorrectionModal(null);
          setSelected(new Set());
        }}
      />

      <section
        style={{
          marginBottom: 16,
          padding: 14,
          border: "1px solid #E5E7EB",
          borderRadius: 10,
          background: "#FAFAFA",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <label style={filterLabel}>
            روستا
            <select
              data-testid="kyc-inbox-village-filter"
              value={villageFilter}
              onChange={(e) => {
                setVillageFilter(e.target.value);
                setPage(1);
              }}
              style={filterInput}
            >
              <option value="">همه روستاها</option>
              {villages.map((v) => (
                <option key={v.id} value={String(v.id)}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label style={filterLabel}>
            نوع
            <select
              data-testid="kyc-inbox-entity-filter"
              value={entityTypeFilter}
              onChange={(e) => {
                setEntityTypeFilter(e.target.value as "" | EntityType);
                setPage(1);
              }}
              style={filterInput}
            >
              {entityTypeOptions.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <JalaliDatePicker
            label="از تاریخ"
            value={fromDate}
            onChange={(v) => {
              setFromDate(v);
              setPage(1);
            }}
            data-testid="kyc-inbox-from-date"
          />
          <JalaliDatePicker
            label="تا تاریخ"
            value={toDate}
            onChange={(v) => {
              setToDate(v);
              setPage(1);
            }}
            data-testid="kyc-inbox-to-date"
          />
        </div>
      </section>

      {inboxStatus === "PENDING" && selected.size > 0 && (
        <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "#374151" }}>{selected.size} مورد انتخاب شده</span>
          <button
            type="button"
            data-testid="kyc-inbox-bulk-approve"
            disabled={bulkProgress !== null || busy !== null}
            onClick={() => setBulkConfirm(true)}
            style={bulkBtn}
          >
            تأیید گروهی
          </button>
          {bulkProgress && (
            <span style={{ fontSize: 12, color: "#166534" }}>
              پیشرفت: {bulkProgress.done}/{bulkProgress.total}
            </span>
          )}
        </div>
      )}

      {err && <div style={alertStyle("danger")}>{err}</div>}

      <p data-testid="kyc-inbox-row-count" style={{ fontSize: 13, color: "#6B7280", margin: "0 0 8px" }}>
        {total} مورد — صفحه {page} از {totalPages}
      </p>

      <DataTable
        testId="kyc-inbox-table"
        columns={columns}
        rows={items}
        rowKey={rowKey}
        sort={{ field: sortField, dir: sortDir }}
        onSort={toggleSort}
        selectable={inboxStatus === "PENDING"}
        selectedKeys={selected}
        onToggleRow={toggleRow}
        onToggleAll={toggleAll}
        rowStyle={(item) => ({
          background: item.status === "PENDING" ? "#FFFBEB" : item.status === "NEEDS_CORRECTION" ? "#FFF7ED" : undefined,
        })}
        rowTitle={(item) =>
          item.status === "NEEDS_CORRECTION" && item.correction_reason
            ? item.correction_reason
            : undefined
        }
        emptyMessage={
          inboxStatus === "PENDING" ? "موردی در صف تأیید نیست." : "موردی در صف «نیاز به اصلاح» نیست."
        }
      />

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center" }}>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={pageBtn}
          >
            قبلی
          </button>
          <span style={{ fontSize: 13, alignSelf: "center" }}>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            style={pageBtn}
          >
            بعدی
          </button>
        </div>
      )}

      {correctionModal && (
        <div style={modalOverlay} role="dialog" aria-modal="true">
          <div style={modalPanel}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>درخواست اصلاح</h3>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#4B5563" }}>
              {kindLabel[correctionModal.entity_type]} #{correctionModal.id} — {correctionModal.name}
            </p>
            <textarea
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              placeholder="دلیل اصلاح (حداقل ۱۰ کاراکتر)…"
              rows={4}
              style={{
                width: "100%",
                padding: 8,
                fontSize: 13,
                boxSizing: "border-box",
                borderRadius: 6,
                border: "1px solid #D1D5DB",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  setCorrectionModal(null);
                  setCorrectionReason("");
                }}
                style={modalCancelBtn}
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={requestCorrection}
                disabled={busy === `${correctionModal.entity_type}-${correctionModal.id}-correction`}
                style={modalConfirmBtn}
              >
                {busy === `${correctionModal.entity_type}-${correctionModal.id}-correction`
                  ? "…"
                  : "ثبت درخواست اصلاح"}
              </button>
            </div>
          </div>
        </div>
      )}

      <SimpleConfirmDialog
        open={bulkConfirm}
        title="مطمئنید؟"
        message={`${selected.size} مورد به‌صورت متوالی تأیید می‌شود (حداکثر ${BULK_MAX}).`}
        confirmLabel="تأیید گروهی"
        onConfirm={bulkApprove}
        onCancel={() => setBulkConfirm(false)}
      />
    </SimplePageLayout>
  );
}

function InboxTabs({
  inboxStatus,
  onChange,
}: {
  inboxStatus: InboxStatus;
  onChange: (s: InboxStatus) => void;
}) {
  const tabs: { id: InboxStatus; label: string }[] = [
    { id: "PENDING", label: "در انتظار تأیید" },
    { id: "NEEDS_CORRECTION", label: "نیاز به اصلاح" },
  ];
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: inboxStatus === t.id ? "2px solid #C2410C" : "1px solid #E5E7EB",
            background: inboxStatus === t.id ? "#FFF7ED" : "#fff",
            color: inboxStatus === t.id ? "#C2410C" : "#374151",
            fontWeight: inboxStatus === t.id ? 700 : 500,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style = statusBadge[status] ?? { bg: "#F3F4F6", color: "#374151", label: status };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        background: style.bg,
        color: style.color,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {style.label}
    </span>
  );
}

function ActionBtn({
  label,
  color,
  onClick,
  disabled,
  loading,
}: {
  label: string;
  color: string;
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        padding: "6px 10px",
        borderRadius: 6,
        border: "none",
        background: color,
        color: "#fff",
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? "…" : label}
    </button>
  );
}

const kycAlertStyle = alertStyle("warn");

const filterLabel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  fontWeight: 600,
  color: brand.textMuted,
};

const filterInput: React.CSSProperties = { ...inputStyle, minWidth: 140, padding: "8px 12px" };

const bulkBtn = btnPrimary;

const pageBtn = btnSecondary;

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(21, 41, 33, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalPanel: React.CSSProperties = {
  background: brand.panel,
  borderRadius: radius.lg,
  padding: space.lg,
  width: "min(420px, 92vw)",
  boxShadow: shadow.md,
  border: `1px solid ${brand.border}`,
};

const modalCancelBtn = btnSecondary;

const modalConfirmBtn: React.CSSProperties = {
  ...btnPrimary,
  background: brand.danger,
  border: `1px solid ${brand.dangerBorder}`,
};
