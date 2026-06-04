import React from "react";
import { Link } from "react-router-dom";
import { useAuthMe } from "../hooks/useAuthMe";
import { PanelNotFound } from "./PanelNotFound";
import type { BreadcrumbSegment } from "../lib/panelBreadcrumbs";
import { brand, fontSize, space } from "../theme";

type Props = {
  title: string;
  /** زیرعنوان یک خط — «الان چه کاری؟» */
  subtitle?: string;
  breadcrumb?: BreadcrumbSegment[];
  intro?: React.ReactNode;
  footer?: React.ReactNode;
  expectedRoles?: string[];
  children: React.ReactNode;
};

function BreadcrumbNav({ segments }: { segments: BreadcrumbSegment[] }) {
  return (
    <nav className="simple-breadcrumb" aria-label="مسیر صفحه" style={{ marginBottom: space.sm, fontSize: 14 }}>
      {segments.map((seg, i) => (
        <span key={`${seg.label}-${i}`}>
          {i > 0 && <span style={{ margin: "0 8px", color: brand.textSoft }}>›</span>}
          {seg.to ? (
            <Link to={seg.to} style={{ color: brand.primary, textDecoration: "none", fontWeight: 600 }}>
              {seg.label}
            </Link>
          ) : (
            <span style={{ color: brand.textMuted }}>{seg.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageFrame({ title, subtitle, breadcrumb, intro, footer, expectedRoles, children }: Props) {
  const { me } = useAuthMe();
  const mismatch =
    me && expectedRoles?.length ? !expectedRoles.includes(me.role) : false;

  if (mismatch) {
    return <PanelNotFound />;
  }

  return (
    <div className="panel-page simple-page">
      {breadcrumb && breadcrumb.length > 0 && <BreadcrumbNav segments={breadcrumb} />}
      <h1
        style={{
          fontSize: fontSize.title,
          color: brand.primaryDark,
          marginTop: 0,
          marginBottom: space.sm,
          fontWeight: 700,
          lineHeight: 1.3,
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p className="simple-page__subtitle" style={{ margin: "0 0 16px", fontSize: 16, color: brand.textMuted, lineHeight: 1.5 }}>
          {subtitle}
        </p>
      )}
      {intro && <div className="panel-page__intro">{intro}</div>}
      {children}
      {footer && <div className="panel-page__footer">{footer}</div>}
    </div>
  );
}
