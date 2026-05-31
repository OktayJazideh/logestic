import type React from "react";

/** Formal «old money» palette — solid colors, no gradients. Wireframe-aligned. */
export const brand = {
  fontFamily: '"Vazirmatn", Tahoma, sans-serif',
  fontMono: 'ui-monospace, "Cascadia Code", Consolas, monospace',

  bg: "#F7F6F2",
  panel: "#FFFFFF",
  panelMuted: "#F3F1EB",
  border: "#D8D4CC",
  borderDark: "#B8B0A4",

  primary: "#1E3A2F",
  primaryDark: "#152921",
  primaryLight: "#E8EDE9",

  accent: "#6B5B4F",
  accentLight: "#F0EBE3",

  text: "#1C1C1C",
  textMuted: "#5C5C5C",
  textSoft: "#8A847A",

  danger: "#7F1D1D",
  dangerBg: "#FAF0F0",
  dangerBorder: "#D4A5A5",

  success: "#2F4F3E",
  successBg: "#EEF3EF",
  successBorder: "#A8C4B0",

  warn: "#6B5A2E",
  warnBg: "#FAF8F3",
  warnBorder: "#C4B896",
} as const;

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
  borderRadius: 8,
};

export const btnPrimary: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 6,
  border: `1px solid ${brand.primaryDark}`,
  background: brand.primary,
  color: "#FFFFFF",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: brand.fontFamily,
};

export const btnSecondary: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: `1px solid ${brand.border}`,
  background: brand.panelMuted,
  color: brand.text,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: brand.fontFamily,
};
