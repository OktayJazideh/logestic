import React from "react";
import { brand, fontSize, radius, shadow, space } from "../../theme";

type Accent = "primary" | "success" | "warn" | "neutral";

const accentBorder: Record<Accent, string> = {
  primary: brand.primary,
  success: brand.success,
  warn: brand.warn,
  neutral: brand.borderDark,
};

type Props = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: Accent;
  style?: React.CSSProperties;
};

export function StatCard({ label, value, hint, accent = "neutral", style }: Props) {
  return (
    <div
      style={{
        flex: "1 1 180px",
        padding: space.md,
        background: brand.panel,
        border: `1px solid ${brand.border}`,
        borderRadius: radius.lg,
        borderInlineStart: `3px solid ${accentBorder[accent]}`,
        boxShadow: shadow.sm,
        ...style,
      }}
    >
      <div style={{ fontSize: fontSize.sm, color: brand.textMuted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: fontSize.xl, fontWeight: 700, color: brand.primaryDark, lineHeight: 1.3 }}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: fontSize.xs, color: brand.textSoft, marginTop: 8, lineHeight: 1.5 }}>{hint}</div>
      )}
    </div>
  );
}
