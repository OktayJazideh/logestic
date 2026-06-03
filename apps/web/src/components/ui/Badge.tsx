import React from "react";
import { brand, radius } from "../../theme";

type Tone = "neutral" | "primary" | "success" | "warn" | "danger";

type Props = {
  children: React.ReactNode;
  tone?: Tone;
  style?: React.CSSProperties;
};

const tones: Record<Tone, React.CSSProperties> = {
  neutral: { background: brand.panelMuted, color: brand.textMuted, border: `1px solid ${brand.border}` },
  primary: { background: brand.primaryLight, color: brand.primaryDark, border: `1px solid ${brand.primaryMuted}` },
  success: { background: brand.successBg, color: brand.success, border: `1px solid ${brand.successBorder}` },
  warn: { background: brand.warnBg, color: brand.warn, border: `1px solid ${brand.warnBorder}` },
  danger: { background: brand.dangerBg, color: brand.danger, border: `1px solid ${brand.dangerBorder}` },
};

export function Badge({ children, tone = "neutral", style }: Props) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 10px",
        borderRadius: radius.sm,
        fontSize: 12,
        fontWeight: 600,
        ...tones[tone],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
