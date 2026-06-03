import React from "react";
import { brand, fontSize, space } from "../theme";

export const fieldErrorStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: fontSize.xs,
  color: brand.danger,
  lineHeight: 1.4,
};

export const fieldHintStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: fontSize.xs,
  color: brand.textMuted,
  lineHeight: 1.4,
};

export function fieldBorderStyle(
  base: React.CSSProperties,
  error: string | undefined,
): React.CSSProperties {
  return error ? { ...base, borderColor: brand.danger } : base;
}

type FormFieldProps = {
  label: React.ReactNode;
  error?: string;
  hint?: string;
  required?: boolean;
  htmlFor?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

export function FormField({ label, error, hint, required, htmlFor, style, children }: FormFieldProps) {
  return (
    <div style={{ marginBottom: space.md, ...style }}>
      <label
        htmlFor={htmlFor}
        style={{
          display: "block",
          fontSize: fontSize.sm,
          fontWeight: 600,
          marginBottom: 8,
          color: brand.primaryDark,
        }}
      >
        {label}
        {required && (
          <span style={{ color: brand.danger, marginInlineStart: 4 }} aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <div role="alert" style={fieldErrorStyle}>
          {error}
        </div>
      ) : hint ? (
        <div style={fieldHintStyle}>{hint}</div>
      ) : null}
    </div>
  );
}
