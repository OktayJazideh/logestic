import React from "react";
import { Link } from "react-router-dom";
import { useAuthMe } from "../hooks/useAuthMe";
import { roleLabelFa } from "../lib/roleLabels";
import { brand, btnSecondary } from "../theme";

type Props = {
  permission?: string;
  permissions?: string[];
  children: React.ReactNode;
};

export function RequirePermission({ permission, permissions, children }: Props) {
  const { ready, can, me } = useAuthMe();
  const required = permissions ?? (permission ? [permission] : []);

  if (!ready) {
    return (
      <div style={{ padding: 24, color: brand.textMuted, fontSize: 14, textAlign: "center" }}>
        در حال بررسی دسترسی…
      </div>
    );
  }

  if (required.length > 0 && !can(required)) {
    return (
      <div
        dir="rtl"
        style={{
          padding: 32,
          maxWidth: 520,
          margin: "24px auto",
          textAlign: "center",
          lineHeight: 1.85,
          color: brand.text,
          border: `1px solid ${brand.border}`,
          borderRadius: 12,
          background: brand.panelMuted,
        }}
      >
        <p style={{ fontWeight: 700, color: brand.warn, margin: "0 0 12px", fontSize: 16 }}>
          دسترسی به این صفحه ندارید
        </p>
        <p style={{ fontSize: 14, margin: "0 0 8px" }}>
          نقش فعلی: <strong>{roleLabelFa(me?.role)}</strong>
        </p>
        <p style={{ fontSize: 14, margin: "0 0 20px", color: brand.textMuted }}>
          برای ورود به این بخش باید مجوز مربوط به نقش شما فعال باشد. از صفحه خانه بخشی را انتخاب کنید که
          برچسب «باز» دارد، یا از منوی کنار استفاده کنید.
        </p>
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

  return <>{children}</>;
}
