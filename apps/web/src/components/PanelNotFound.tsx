import React from "react";
import { Link } from "react-router-dom";
import { brand, btnSecondary, fontSize } from "../theme";

export function PanelNotFound() {
  return (
    <div
      dir="rtl"
      style={{
        padding: 48,
        maxWidth: 420,
        margin: "48px auto",
        textAlign: "center",
        lineHeight: 1.6,
        color: brand.text,
      }}
    >
      <p
        style={{
          margin: "0 0 8px",
          fontSize: 56,
          fontWeight: 700,
          color: brand.textMuted,
          letterSpacing: "-0.02em",
        }}
      >
        404
      </p>
      <p style={{ margin: "0 0 24px", fontSize: fontSize.base, color: brand.textMuted }}>صفحه یافت نشد.</p>
      <Link
        to="/panel"
        style={{
          ...btnSecondary,
          display: "inline-block",
          textDecoration: "none",
          color: brand.text,
        }}
      >
        بازگشت به خانه
      </Link>
    </div>
  );
}
