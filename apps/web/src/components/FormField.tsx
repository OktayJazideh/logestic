import React from "react";
import { brand } from "../theme";

export const fieldErrorStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: brand.danger,
  lineHeight: 1.4,
};

export const fieldHintStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 11,
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
    <div style={{ marginBottom: 14, ...style }}>
      <label htmlFor={htmlFor} style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: brand.text }}>
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
