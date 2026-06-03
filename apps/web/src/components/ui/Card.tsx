import React from "react";
import { brand, radius, shadow, space } from "../../theme";

type Props = {
  children: React.ReactNode;
  title?: React.ReactNode;
  padding?: number;
  style?: React.CSSProperties;
  /** لینک/کارت قابل کلیک */
  as?: "div" | "article";
  onClick?: () => void;
  "data-testid"?: string;
};

export function Card({ children, title, padding = space.lg, style, as = "div", onClick, "data-testid": testId }: Props) {
  const Tag = as;
  return (
    <Tag
      data-testid={testId}
      onClick={onClick}
      style={{
        background: brand.panel,
        border: `1px solid ${brand.border}`,
        borderRadius: radius.lg,
        boxShadow: shadow.sm,
        padding,
        marginBottom: space.md,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            fontWeight: 700,
            fontSize: 15,
            color: brand.primaryDark,
            marginBottom: space.sm,
          }}
        >
          {title}
        </div>
      )}
      {children}
    </Tag>
  );
}
