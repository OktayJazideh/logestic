import React from "react";
import { Link } from "react-router-dom";
import { PageFrame } from "../components/PageFrame";
import { useAuthMe } from "../hooks/useAuthMe";
import { homeSectionsForUser } from "../lib/panelHomeSections";
import { roleLabelFa } from "../lib/roleLabels";
import { PLATFORM_LEGAL_TERMS_FA } from "../lib/platformLegal";

const card: React.CSSProperties = {
  display: "block",
  padding: 14,
  borderRadius: 10,
  border: "1px solid #E5E7EB",
  background: "#F9FAFB",
  textDecoration: "none",
  color: "#111827",
  marginBottom: 10,
};

const HSA_GUIDE_ROLES = new Set(["OPERATION_ADMIN", "COOP_ADMIN"]);

export default function PanelHome() {
  const { me, error, hasToken, can } = useAuthMe();
  const showHsaGuide = me?.role != null && HSA_GUIDE_ROLES.has(me.role);
  const sections = homeSectionsForUser(can);

  return (
    <PageFrame
      title="داشبورد"
      intro="از منوی کنار یا کارت‌های زیر وارد بخش‌هایی شوید که برای نقش شما فعال است."
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
        <div style={{ fontWeight: 700, marginBottom: 6, color: "#111827" }}>وضعیت نشست</div>
        {!hasToken && <div style={{ fontSize: 14, color: "#6B7280" }}>نشست فعال نیست.</div>}
        {hasToken && error && <div style={{ fontSize: 14, color: "#B45309" }}>{error}</div>}
        {hasToken && me && (
          <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
            <div>
              نقش: <strong>{roleLabelFa(me.role)}</strong>
            </div>
            <div>موبایل: {me.mobile_number}</div>
          </div>
        )}
      </div>

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
          <summary
            style={{
              cursor: "pointer",
              fontWeight: 700,
              color: "#1E3A8A",
              listStylePosition: "inside",
            }}
          >
            راهنمای کار انسانی در سیستم
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
            <li>
              محاسبه سهم‌ها و پیش‌نویس صورت وضعیت خودکار است؛ شما بازبینی، تأیید و قفل دوره را انجام می‌دهید.
            </li>
            <li>تخصیص مأموریت و احراز هویت اعضا به‌صورت دستی در پنل انجام می‌شود.</li>
            <li>واریز بانکی واقعی و ثبت رسید پرداخت با شماست؛ سیستم فقط فایل و وضعیت را آماده می‌کند.</li>
            <li>توزیع سهم خانوار فقط پس از قفل دوره و با تأیید ادمین انجام می‌شود.</li>
          </ul>
        </details>
      )}

      <div style={{ fontWeight: 700, marginBottom: 10, color: "#111827" }}>بخش‌های در دسترس شما</div>

      {sections.length === 0 ? (
        <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.7 }}>
          برای نقش فعلی بخشی در این فهرست نیست. از منوی کنار استفاده کنید یا با پشتیبانی هماهنگ کنید.
        </p>
      ) : (
        sections.map((s) => (
          <Link key={s.to} to={s.to} style={card} data-testid={`home-link-${s.to.replace(/\//g, "-")}`}>
            <div style={{ fontWeight: 700 }}>{s.title}</div>
            <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>{s.description}</div>
          </Link>
        ))
      )}

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
