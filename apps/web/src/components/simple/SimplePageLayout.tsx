import React from "react";
import { Link } from "react-router-dom";
import { PageFrame } from "../PageFrame";
import type { BreadcrumbSegment } from "../../lib/panelBreadcrumbs";
import { brand, space } from "../../theme";

export type SimpleFooterAction = {
  label: string;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  busy?: boolean;
  testId?: string;
  to?: string;
};

type Props = {
  title: string;
  subtitle?: string;
  breadcrumb?: BreadcrumbSegment[];
  expectedRoles?: string[];
  children: React.ReactNode;
  footer?: SimpleFooterAction[];
  intro?: React.ReactNode;
};

export function SimplePageLayout({
  title,
  subtitle,
  breadcrumb,
  expectedRoles,
  children,
  footer,
  intro,
}: Props) {
  const footerNode =
    footer && footer.length > 0 ? (
      <div
        className="simple-footer-cta"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: space.sm,
          alignItems: "center",
        }}
      >
        {footer.map((action, i) => {
          const variant = action.variant ?? (i === 0 && !action.to ? "primary" : "secondary");
          const label = action.busy ? "در حال انجام…" : action.label;
          if (action.to) {
            return (
              <Link
                key={action.label}
                to={action.to}
                data-testid={action.testId}
                className={`simple-footer-link simple-footer-link--${variant}`}
                style={{ textDecoration: "none" }}
              >
                {label}
              </Link>
            );
          }
          return (
            <button
              key={action.label}
              type={action.type ?? "button"}
              data-testid={action.testId}
              disabled={action.disabled || action.busy}
              onClick={action.onClick}
              className={`simple-footer-btn simple-footer-btn--${variant}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    ) : undefined;

  return (
    <PageFrame
      title={title}
      subtitle={subtitle}
      breadcrumb={breadcrumb}
      intro={intro}
      footer={footerNode}
      expectedRoles={expectedRoles}
    >
      <div className="simple-page__content">{children}</div>
    </PageFrame>
  );
}
