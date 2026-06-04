import React from "react";
import { Badge } from "../ui/Badge";

type Tone = "neutral" | "primary" | "success" | "warn" | "danger";

type Props = {
  label: string;
  tone?: Tone;
  /** آیکون اختیاری کنار متن */
  icon?: React.ReactNode;
  size?: "md" | "lg";
  style?: React.CSSProperties;
};

export function StatusBadge({ label, tone = "neutral", icon, size = "md", style }: Props) {
  return (
    <span className={`status-badge status-badge--${size}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, ...style }}>
      {icon}
      <Badge tone={tone} style={size === "lg" ? { fontSize: 14, padding: "8px 14px" } : undefined}>
        {label}
      </Badge>
    </span>
  );
}
