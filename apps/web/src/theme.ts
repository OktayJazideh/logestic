import type React from "react";

/** همسهمان — پالت رسمی معدنی، بدون گرادیان */
export const brand = {
  fontFamily: '"Vazirmatn", Tahoma, sans-serif',
  fontMono: 'ui-monospace, "Cascadia Code", Consolas, monospace',

  bg: "#F7F8FA",
  panel: "#FFFFFF",
  panelMuted: "#F1F3F5",
  border: "#E4E7EC",
  borderDark: "#C4BCB0",

  primary: "#1E3A2F",
  primaryDark: "#152921",
  primaryLight: "#E6EFEA",
  primaryMuted: "#D4E4DC",

  accent: "#6B5B4F",
  accentLight: "#F2EDE6",

  text: "#1A1A1A",
  textMuted: "#5A5650",
  textSoft: "#8A8478",

  danger: "#7F1D1D",
  dangerBg: "#FBF4F4",
  dangerBorder: "#E8C4C4",

  success: "#2F4F3E",
  successBg: "#F0F6F2",
  successBorder: "#B8D4C4",

  warn: "#6B5A2E",
  warnBg: "#FBF9F4",
  warnBorder: "#DDD0A8",

  /** سطوح جدول و بخش‌ها */
  surfaceTableHead: "#F1F3F5",
  surfaceRowHover: "#FAFBFC",
  surfaceRowStripe: "#F7F8FA",

  sidebarBg: "#152921",
  sidebarText: "#E8EEEB",
  sidebarMuted: "#9BB5A8",
  sidebarActive: "#1E3A2F",
} as const;

export const space = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
} as const;

export const shadow = {
  sm: "0 1px 2px rgba(21, 41, 33, 0.06)",
  md: "0 4px 12px rgba(21, 41, 33, 0.08)",
  lg: "0 8px 24px rgba(21, 41, 33, 0.1)",
} as const;

export const fontSize = {
  xs: 12,
  sm: 13,
  base: 14,
  md: 15,
  body: 16,
  caption: 14,
  lg: 18,
  xl: 22,
  title: 24,
} as const;

/** حداقل ارتفاع/لمس CTA — UX-SIMPLE-SPEC-1 */
export const touchMin = 48;

/** رنگ معنایی — هم‌راستا global.css و mineral_ui SemanticColors */
export const semantic = {
  success: brand.success,
  successBg: brand.successBg,
  danger: brand.danger,
  dangerBg: brand.dangerBg,
  warn: brand.warn,
  warnBg: brand.warnBg,
  muted: brand.textMuted,
} as const;

export const inputHeight = 44;

export const tableCellPadding = "12px 14px";

export const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: brand.bg,
  fontFamily: brand.fontFamily,
  color: brand.text,
  boxSizing: "border-box",
};

export const cardStyle: React.CSSProperties = {
  background: brand.panel,
  border: `1px solid ${brand.border}`,
  borderRadius: radius.lg,
  boxShadow: shadow.sm,
};

export const filterBarStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-end",
  gap: space.md,
};

export const statCardStyle: React.CSSProperties = {
  ...cardStyle,
  flex: "1 1 180px",
  padding: space.md,
  marginBottom: 0,
};

export const sectionStyle: React.CSSProperties = {
  marginBottom: space.lg,
  padding: space.lg,
  borderRadius: radius.lg,
  border: `1px solid ${brand.border}`,
  background: brand.panel,
  boxShadow: shadow.sm,
};

export const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: inputHeight,
  padding: "10px 14px",
  borderRadius: radius.md,
  border: `1px solid ${brand.border}`,
  fontSize: fontSize.md,
  boxSizing: "border-box",
  fontFamily: brand.fontFamily,
  background: brand.panel,
  color: brand.text,
};

export const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};

export const tableThStyle: React.CSSProperties = {
  padding: tableCellPadding,
  borderBottom: `2px solid ${brand.border}`,
  background: brand.surfaceTableHead,
  fontWeight: 700,
  fontSize: fontSize.sm,
  color: brand.primaryDark,
  textAlign: "right" as const,
  whiteSpace: "nowrap" as const,
};

export const tableTdStyle: React.CSSProperties = {
  padding: tableCellPadding,
  borderBottom: `1px solid ${brand.border}`,
  fontSize: fontSize.base,
  verticalAlign: "top" as const,
};

export type AlertVariant = "info" | "success" | "warn" | "danger";

export function alertStyle(variant: AlertVariant): React.CSSProperties {
  const map: Record<AlertVariant, React.CSSProperties> = {
    info: {
      background: brand.primaryLight,
      border: `1px solid ${brand.primaryMuted}`,
      color: brand.primaryDark,
    },
    success: {
      background: brand.successBg,
      border: `1px solid ${brand.successBorder}`,
      color: brand.success,
    },
    warn: {
      background: brand.warnBg,
      border: `1px solid ${brand.warnBorder}`,
      color: brand.warn,
    },
    danger: {
      background: brand.dangerBg,
      border: `1px solid ${brand.dangerBorder}`,
      color: brand.danger,
    },
  };
  return {
    marginBottom: space.md,
    padding: `${space.sm}px ${space.md}px`,
    borderRadius: radius.md,
    fontSize: fontSize.base,
    lineHeight: 1.6,
    ...map[variant],
  };
}

export const btnBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "11px 20px",
  borderRadius: radius.md,
  fontSize: fontSize.base,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: brand.fontFamily,
  transition: "background 0.15s ease, border-color 0.15s ease",
};

export const btnPrimary: React.CSSProperties = {
  ...btnBase,
  border: `1px solid ${brand.primaryDark}`,
  background: brand.primary,
  color: "#FFFFFF",
};

export const btnSecondary: React.CSSProperties = {
  ...btnBase,
  border: `1px solid ${brand.border}`,
  background: brand.panel,
  color: brand.text,
};

export const btnGhost: React.CSSProperties = {
  ...btnBase,
  border: "1px solid transparent",
  background: "transparent",
  color: brand.primary,
};

export const btnDanger: React.CSSProperties = {
  ...btnBase,
  border: `1px solid ${brand.dangerBorder}`,
  background: brand.dangerBg,
  color: brand.danger,
};
