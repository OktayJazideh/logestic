import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SimplePageLayout } from "../components/simple/SimplePageLayout";
import { ErrorBanner } from "../components/simple/ErrorBanner";
import { StatusBadge } from "../components/simple/StatusBadge";
import { breadcrumbsForPath } from "../lib/panelBreadcrumbs";
import { apiGetData } from "../api";
import { formatJalaliDateTime } from "../lib/jalaliDate";

type InboxItemType = "period_statement" | "kyc" | "objection";

type InboxItem = {
  type: InboxItemType;
  id: number;
  title: string;
  status: string;
  waiting_since: string;
  required_roles: string[];
  entity_kind?: string;
};

type TabKey = InboxItemType;

const tabLabels: Record<TabKey, string> = {
  period_statement: "صورت وضعیت",
  kyc: "احراز هویت",
  objection: "اعتراض",
};

const detailPath: Record<TabKey, string> = {
  period_statement: "/panel/admin/period-statement",
  kyc: "/panel/kyc",
  objection: "/panel/members",
};

const th: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #E5E7EB",
  fontWeight: 600,
};
const td: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #F3F4F6",
};

function formatWaitingSince(iso: string): string {
  return formatJalaliDateTime(iso);
}

export default function ApprovalsInbox() {
  const [tab, setTab] = useState<TabKey>("period_statement");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiGetData<{ items: InboxItem[]; mine_id: number }>("/inbox");
    setLoading(false);
    if (!r.ok) {
      setErr(r.message);
      setItems([]);
      return;
    }
    setErr(null);
    setItems(r.data.items);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { period_statement: 0, kyc: 0, objection: 0 };
    for (const i of items) c[i.type]++;
    return c;
  }, [items]);

  const visible = useMemo(() => items.filter((i) => i.type === tab), [items, tab]);

  return (
    <SimplePageLayout
      title="صندوق تأییدها"
      subtitle="کارهای در انتظار تأیید شما — روی هر مورد بروید و اقدام کنید."
      breadcrumb={breadcrumbsForPath("/panel/approvals")}
      expectedRoles={["COOP_ADMIN", "OPERATION_ADMIN"]}
      intro={
        <div
          style={{
            margin: 0,
            padding: "10px 14px",
            background: "#F3F1EB",
            border: "1px solid #BFDBFE",
            borderRadius: 8,
            color: "#1E40AF",
            fontSize: 14,
          }}
        >
          هر کاربر با این نقش می‌تواند اقدام کند — بدون انتساب به یک نفر؛ اقدامات در audit با{" "}
          <code style={{ fontSize: 12 }}>performed_by</code> ثبت می‌شود.
        </div>
      }
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(Object.keys(tabLabels) as TabKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: tab === key ? "2px solid #1B5E20" : "1px solid #D1D5DB",
              background: tab === key ? "#ECFDF5" : "#fff",
              cursor: "pointer",
              fontWeight: tab === key ? 700 : 500,
              fontSize: 13,
            }}
          >
            {tabLabels[key]}
            {counts[key] > 0 ? ` (${counts[key]})` : ""}
          </button>
        ))}
      </div>

      {err && (
        <ErrorBanner
          message={err}
          actionHint="ابتدا محل کار (معدن) را انتخاب کنید، سپس «بروزرسانی»."
          onRetry={() => void load()}
        />
      )}

      {loading && <p style={{ color: "#6B7280", fontSize: 13 }}>در حال بارگذاری…</p>}

      {!loading && visible.length === 0 && !err && (
        <p style={{ color: "#6B7280", fontSize: 13 }}>موردی در صف {tabLabels[tab]} نیست.</p>
      )}

      {visible.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F3F4F6", textAlign: "right" as const }}>
              <th style={th}>عنوان</th>
              <th style={th}>وضعیت</th>
              <th style={th}>منتظر از</th>
              <th style={th}>نقش‌های لازم</th>
              <th style={th}>جزئیات</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => (
              <tr key={`${item.type}-${item.id}-${item.entity_kind ?? ""}`}>
                <td style={td}>{item.title}</td>
                <td style={td}>
                  <StatusBadge label={item.status} tone="warn" />
                </td>
                <td style={td}>{formatWaitingSince(item.waiting_since)}</td>
                <td style={td}>
                  {item.required_roles.map((r) => (
                    <span
                      key={r}
                      style={{
                        display: "inline-block",
                        marginLeft: 4,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "#E0E7FF",
                        color: "#3730A3",
                        fontSize: 11,
                      }}
                    >
                      {r}
                    </span>
                  ))}
                </td>
                <td style={td}>
                  <Link
                    to={detailPath[item.type]}
                    style={{ color: "#1B5E20", fontWeight: 600, textDecoration: "none" }}
                  >
                    باز کردن ←
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SimplePageLayout>
  );
}
