import React from "react";
import { Link } from "react-router-dom";
import { brand, radius, shadow, space } from "../../theme";
import { PanelHomeIcon, type HomeIconKey } from "./PanelHomeIcons";

type Props = {
  to: string;
  title: string;
  description: string;
  iconKey: HomeIconKey;
  testId?: string;
};

export function HomeActionCard({ to, title, description, iconKey, testId }: Props) {
  return (
    <Link
      to={to}
      className="home-action-card"
      data-testid={testId}
      style={{
        display: "block",
        textDecoration: "none",
        color: brand.text,
      }}
    >
      <div
        style={{
          height: "100%",
          padding: space.lg,
          borderRadius: radius.lg,
          border: `1px solid ${brand.primaryMuted}`,
          background: brand.panel,
          boxShadow: shadow.sm,
          transition: "box-shadow 0.15s ease, border-color 0.15s ease",
        }}
      >
        <div style={{ display: "flex", gap: space.md, alignItems: "flex-start" }}>
          <div
            aria-hidden
            style={{
              flexShrink: 0,
              width: 48,
              height: 48,
              borderRadius: radius.md,
              background: brand.primaryLight,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: brand.primaryDark,
            }}
          >
            <PanelHomeIcon iconKey={iconKey} size={28} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: brand.primaryDark, marginBottom: 6 }}>{title}</div>
            <div style={{ fontSize: 14, color: brand.textMuted, lineHeight: 1.55 }}>{description}</div>
          </div>
        </div>
      </div>
    </Link>
  );
}
