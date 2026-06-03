import React, { useState } from "react";
import { Link } from "react-router-dom";
import { PageFrame } from "../components/PageFrame";
import { Alert, Badge, Card } from "../components/ui";
import { useAuthMe } from "../hooks/useAuthMe";
import { allHomeSectionsWithAccess } from "../lib/panelHomeSections";
import { roleLabelFa } from "../lib/roleLabels";
import { PLATFORM_LEGAL_TERMS_FA } from "../lib/platformLegal";
import { brand, radius, space } from "../theme";

const HSA_GUIDE_ROLES = new Set(["OPERATION_ADMIN", "COOP_ADMIN"]);

function sectionLinkStyle(accessible: boolean): React.CSSProperties {
  return {
    display: "block",
    textDecoration: "none",
    color: brand.text,
    marginBottom: space.sm,
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
      intro="همه بخش‌های سیستم اینجا فهرست شده‌اند. روی هر کارت که برای نقش شما باز است کلیک کنید."
    >
      <Card title="خلاصه حساب" padding={space.lg}>
        {!hasToken && <div style={{ fontSize: 14, color: brand.textMuted }}>وارد نشده‌اید.</div>}
        {hasToken && error && <Alert variant="warn">{error}</Alert>}
        {hasToken && me && (
          <div style={{ fontSize: 14, color: brand.text, lineHeight: 1.8 }}>
            <div>
              نقش شما: <strong>{roleLabelFa(me.role)}</strong>
            </div>
            <div>شماره موبایل: {me.mobile_number}</div>
            <div style={{ marginTop: 6, color: brand.primaryDark }}>
              {accessibleCount} بخش از {sections.length} بخش برای شما باز است.
            </div>
          </div>
        )}
      </Card>

      {blockedHint && <Alert variant="warn">{blockedHint}</Alert>}

      {showHsaGuide && (
        <details
          data-testid="hsa-human-role-guide"
          dir="rtl"
          style={{
            marginBottom: space.lg,
            padding: space.md,
            borderRadius: radius.lg,
            border: `1px solid ${brand.border}`,
            background: brand.panelMuted,
          }}
        >
          <summary style={{ cursor: "pointer", fontWeight: 700, color: brand.primaryDark, listStylePosition: "inside" }}>
            راهنمای کارهایی که باید خودتان انجام دهید
          </summary>
          <ul
            style={{
              margin: "10px 0 0",
              paddingInlineStart: 20,
              fontSize: 13,
              lineHeight: 1.85,
              color: brand.text,
            }}
          >
            <li>محاسبه سهم و صورت وضعیت خودکار است؛ شما بررسی، تأیید و قفل را انجام می‌دهید.</li>
            <li>تخصیص مأموریت و تأیید عضویت در پنل انجام می‌شود.</li>
            <li>واریز بانکی و ثبت رسید با شماست.</li>
          </ul>
        </details>
      )}

      <div style={{ fontWeight: 700, marginBottom: space.md, color: brand.primaryDark, fontSize: 16 }}>
        بخش‌های پنل
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: space.md,
        }}
      >
        {sections.map((s) => {
          const inner = (
            <Card
              padding={space.md}
              style={{
                marginBottom: 0,
                height: "100%",
                borderColor: s.canAccess ? brand.primaryMuted : brand.border,
                background: s.canAccess ? brand.primaryLight : brand.panel,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ fontWeight: 700, color: brand.primaryDark }}>{s.title}</div>
                <Badge tone={s.canAccess ? "success" : "neutral"}>{s.canAccess ? "باز" : "بدون دسترسی"}</Badge>
              </div>
              <div style={{ fontSize: 13, color: brand.textMuted, marginTop: 8, lineHeight: 1.6 }}>{s.description}</div>
            </Card>
          );

          if (s.canAccess) {
            return (
              <Link
                key={s.to}
                to={s.to}
                style={sectionLinkStyle(true)}
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
              style={sectionLinkStyle(false)}
              data-testid={`home-link-locked-${s.to.replace(/\//g, "-")}`}
              onClick={() =>
                setBlockedHint(
                  `«${s.title}» برای نقش ${roleLabelFa(me?.role)} فعال نیست. از منوی کنار یا بخش‌های باز استفاده کنید.`,
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setBlockedHint(`«${s.title}» برای نقش ${roleLabelFa(me?.role)} فعال نیست.`);
                }
              }}
            >
              {inner}
            </div>
          );
        })}
      </div>

      <footer
        dir="rtl"
        style={{
          marginTop: space.xl,
          paddingTop: space.lg,
          borderTop: `1px solid ${brand.border}`,
          fontSize: 12,
          color: brand.textMuted,
          lineHeight: 1.7,
        }}
      >
        {PLATFORM_LEGAL_TERMS_FA}
      </footer>
    </PageFrame>
  );
}
