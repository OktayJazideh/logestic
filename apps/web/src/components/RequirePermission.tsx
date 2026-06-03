import React from "react";
import { Link } from "react-router-dom";
import { useAuthMe } from "../hooks/useAuthMe";
import { roleLabelFa } from "../lib/roleLabels";

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
      <div style={{ padding: 24, color: "#6B7280", fontSize: 14, textAlign: "center" }}>
        در حال بررسی دسترسی…
      </div>
    );
  }

  if (required.length > 0 && !can(required)) {
    return (
      <div
        dir="rtl"
        style={{
          padding: 24,
          maxWidth: 480,
          margin: "0 auto",
          textAlign: "center",
          lineHeight: 1.8,
          color: "#374151",
        }}
      >
        <p style={{ fontWeight: 700, color: "#B45309", marginBottom: 8 }}>دسترسی به این بخش ندارید</p>
        <p style={{ fontSize: 14, margin: "0 0 16px" }}>
          نقش فعلی: <strong>{roleLabelFa(me?.role)}</strong>
          <br />
          برای ورود به این صفحه مجوز لازم است. از منو یا صفحه خانه بخشی را انتخاب کنید که برای شما باز است.
        </p>
        <Link
          to="/panel"
          style={{
            display: "inline-block",
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid #D1D5DB",
            background: "#F9FAFB",
            textDecoration: "none",
            color: "#111827",
            fontSize: 14,
          }}
        >
          بازگشت به خانه
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
