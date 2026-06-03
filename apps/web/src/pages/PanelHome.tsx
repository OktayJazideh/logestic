import React, { useState } from "react";
import { Link } from "react-router-dom";
import { PageFrame } from "../components/PageFrame";
import { useAuthMe } from "../hooks/useAuthMe";
import { allHomeSectionsWithAccess } from "../lib/panelHomeSections";
import { roleLabelFa } from "../lib/roleLabels";
import { PLATFORM_LEGAL_TERMS_FA } from "../lib/platformLegal";
import { brand } from "../theme";

const HSA_GUIDE_ROLES = new Set(["OPERATION_ADMIN", "COOP_ADMIN"]);

function cardStyle(accessible: boolean): React.CSSProperties {
  return {
    display: "block",
    padding: 14,
    borderRadius: 10,
    border: `1px solid ${accessible ? brand.primary : "#E5E7EB"}`,
    background: accessible ? "#F0FDF4" : "#F9FAFB",
    textDecoration: "none",
    color: "#111827",
    marginBottom: 10,
    opacity: accessible ? 1 : 0.92,
    cursor: accessible ? "pointer" : "default",
  };
}

export default function PanelHome() {
  const { me, error, hasToken, can } = useAuthMe();
  const showHsaGuide = me?.role != null && HSA_GUIDE_ROLES.has(me.role);
  const sections = allHomeSectionsWithAccess(can);
  const accessibleCount = sections.filter((s) => s.canAccess).length;
  const [blockedHint, setBlockedHint] = useState<string | null>(null);

  return (
    <PageFrame
      title="خانه"
      intro="همه بخش‌های سیستم اینجا فهرست شده‌اند. روی هر کارت که برای نقش شما سبز است کلیک کنید تا وارد همان بخش شوید."
    >
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          borderRadius: 10,
          border: "1px solid #D1D5DB",
          background: "#FFFFFF",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6, color: "#111827" }}>خلاصه حساب</div>
        {!hasToken && <div style={{ fontSize: 14, color: "#6B7280" }}>وارد نشده‌اید.</div>}
        {hasToken && error && <div style={{ fontSize: 14, color: "#B45309" }}>{error}</div>}
        {hasToken && me && (
          <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
            <div>
              نقش شما: <strong>{roleLabelFa(me.role)}</strong>
            </div>
            <div>شماره موبایل: {me.mobile_number}</div>
            <div style={{ marginTop: 6, color: brand.primaryDark }}>
              {accessibleCount} بخش از {sections.length} بخش برای شما باز است.
            </div>
          </div>
        )}
      </div>

      {blockedHint && (
        <div
          role="status"
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 8,
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            fontSize: 13,
            color: "#92400E",
          }}
        >
          {blockedHint}
        </div>
      )}

      {showHsaGuide && (
        <details
          data-testid="hsa-human-role-guide"
          dir="rtl"
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #BFDBFE",
            background: "#F3F1EB",
          }}
        >
          <summary style={{ cursor: "pointer", fontWeight: 700, color: "#1E3A8A", listStylePosition: "inside" }}>
            راهنمای کارهایی که باید خودتان انجام دهید
          </summary>
          <ul
            style={{
              margin: "10px 0 0",
              paddingInlineStart: 20,
              fontSize: 13,
              lineHeight: 1.85,
              color: "#1E40AF",
            }}
          >
            <li>محاسبه سهم و صورت وضعیت خودکار است؛ شما بررسی، تأیید و قفل را انجام می‌دهید.</li>
            <li>تخصیص مأموریت و تأیید عضویت در پنل انجام می‌شود.</li>
            <li>واریز بانکی و ثبت رسید با شماست.</li>
          </ul>
        </details>
      )}

      <div style={{ fontWeight: 700, marginBottom: 10, color: "#111827" }}>بخش‌های پنل</div>

      {sections.map((s) => {
        const inner = (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>{s.title}</div>
              <span
                style={{
                  fontSize: 10,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: s.canAccess ? "#DCFCE7" : "#F3F4F6",
                  color: s.canAccess ? "#166534" : "#6B7280",
                  flexShrink: 0,
                }}
              >
                {s.canAccess ? "باز" : "بدون دسترسی"}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>{s.description}</div>
          </>
        );

        if (s.canAccess) {
          return (
            <Link
              key={s.to}
              to={s.to}
              style={cardStyle(true)}
              data-testid={`home-link-${s.to.replace(/\//g, "-")}`}
              onClick={() => setBlockedHint(null)}
            >
              {inner}
            </Link>
          );
        }

        return (
          <div
            key={s.to}
            role="button"
            tabIndex={0}
            style={cardStyle(false)}
            data-testid={`home-link-locked-${s.to.replace(/\//g, "-")}`}
            onClick={() =>
              setBlockedHint(
                `«${s.title}» برای نقش ${roleLabelFa(me?.role)} فعال نیست. از منوی کنار یا بخش‌های سبز استفاده کنید.`,
              )
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setBlockedHint(
                  `«${s.title}» برای نقش ${roleLabelFa(me?.role)} فعال نیست.`,
                );
              }
            }}
          >
            {inner}
          </div>
        );
      })}

      <footer
        dir="rtl"
        style={{
          marginTop: 24,
          paddingTop: 16,
          borderTop: "1px solid #E5E7EB",
          fontSize: 12,
          color: "#6B7280",
          lineHeight: 1.7,
        }}
      >
        {PLATFORM_LEGAL_TERMS_FA}
      </footer>
    </PageFrame>
  );
}
