import React from "react";
import { Link } from "react-router-dom";
import { PageFrame } from "../components/PageFrame";
import { Alert, Badge, Button, Card } from "../components/ui";
import { useAuthMe } from "../hooks/useAuthMe";
import { allHomeSectionsWithAccess } from "../lib/panelHomeSections";
import { roleHomeFor } from "../lib/roleHome";
import { roleLabelFa } from "../lib/roleLabels";
import { brand, radius, space } from "../theme";

export default function PanelHome() {
  const { me, error, hasToken, can } = useAuthMe();
  const sections = allHomeSectionsWithAccess(can).filter((s) => s.canAccess);
  const roleHome = roleHomeFor(me?.role);

  return (
    <PageFrame
      title="خانه"
      intro="میانبرهای کاری مربوط به نقش شما — فقط بخش‌هایی که دسترسی دارید."
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
              {sections.length} بخش فعال برای شما
            </div>
          </div>
        )}
      </Card>

      {roleHome && roleHome.quickActions.length > 0 && (
        <div
          style={{
            marginTop: space.lg,
            marginBottom: space.lg,
            padding: space.md,
            borderRadius: radius.lg,
            border: `1px solid ${brand.border}`,
            background: brand.panel,
            boxShadow: "0 1px 2px rgba(21, 41, 33, 0.04)",
          }}
        >
          <div style={{ fontWeight: 700, color: brand.primaryDark, marginBottom: space.sm }}>
            پیشنهاد شروع
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm }}>
            {roleHome.quickActions.map((a, i) => (
              <Link key={a.to} to={a.to} style={{ textDecoration: "none" }}>
                <Button variant={i === 0 ? "primary" : "secondary"}>{a.label}</Button>
              </Link>
            ))}
          </div>
        </div>
      )}

      {sections.length === 0 && hasToken && me && (
        <Alert variant="warn">برای نقش شما بخشی در پنل وب تعریف نشده است. با پشتیبانی تماس بگیرید.</Alert>
      )}

      {sections.length > 0 && (
        <>
          <div style={{ fontWeight: 700, marginBottom: space.md, color: brand.primaryDark, fontSize: 16 }}>
            بخش‌های شما
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: space.md,
            }}
          >
            {sections.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: brand.text,
                }}
                data-testid={`home-link-${s.to.replace(/\//g, "-")}`}
              >
                <Card
                  padding={space.md}
                  style={{
                    marginBottom: 0,
                    height: "100%",
                    borderColor: brand.primaryMuted,
                    background: brand.panel,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ fontWeight: 700, color: brand.primaryDark }}>{s.title}</div>
                    <Badge tone="success">باز</Badge>
                  </div>
                  <div style={{ fontSize: 13, color: brand.textMuted, marginTop: 8, lineHeight: 1.6 }}>
                    {s.description}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </PageFrame>
  );
}
