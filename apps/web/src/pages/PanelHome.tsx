import React, { useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { HomeActionCard } from "../components/simple/HomeActionCard";
import { Alert, Card } from "../components/ui";
import { useAuthMe } from "../hooks/useAuthMe";
import { allHomeSectionsWithAccess, homeCardsForRole } from "../lib/panelHomeSections";
import { roleLabelFa } from "../lib/roleLabels";
import { brand, space } from "../theme";

export default function PanelHome() {
  const { me, error, hasToken, can } = useAuthMe();
  const homeCards = homeCardsForRole(me?.role, can);
  const allSections = allHomeSectionsWithAccess(can).filter((s) => s.canAccess);
  const [showAll, setShowAll] = useState(false);

  return (
    <PageFrame
      title="خانه"
      subtitle="کدام کار را می‌خواهید انجام دهید؟"
      breadcrumb={[{ label: "خانه" }]}
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
          </div>
        )}
      </Card>

      {homeCards.length === 0 && hasToken && me && (
        <Alert variant="warn">برای نقش شما بخشی در پنل وب تعریف نشده است. با پشتیبانی تماس بگیرید.</Alert>
      )}

      {homeCards.length > 0 && (
        <>
          <div
            style={{
              fontWeight: 700,
              marginTop: space.lg,
              marginBottom: space.md,
              color: brand.primaryDark,
              fontSize: 16,
            }}
          >
            کارهای اصلی شما
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: space.md,
            }}
          >
            {homeCards.map((s) => (
              <HomeActionCard
                key={s.to}
                to={s.to}
                title={s.title}
                description={s.description}
                iconKey={s.iconKey}
                testId={`home-link-${s.to.replace(/\//g, "-")}`}
              />
            ))}
          </div>

          {allSections.length > homeCards.length && (
            <div style={{ marginTop: space.lg }}>
              <button
                type="button"
                className="simple-footer-btn simple-footer-btn--secondary"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? "بستن فهرست" : "همه بخش‌ها"}
              </button>
            </div>
          )}

          {showAll && allSections.length > homeCards.length && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: space.md,
                marginTop: space.md,
              }}
            >
              {allSections
                .filter((s) => !homeCards.some((h) => h.to === s.to))
                .map((s) => (
                  <HomeActionCard
                    key={s.to}
                    to={s.to}
                    title={s.title}
                    description={s.description}
                    iconKey={s.iconKey}
                    testId={`home-link-${s.to.replace(/\//g, "-")}`}
                  />
                ))}
            </div>
          )}
        </>
      )}

    </PageFrame>
  );
}
