import React from "react";
import { useAuthMe } from "../hooks/useAuthMe";

type Props = {
  title: string;
  intro?: React.ReactNode;
  /** نقش‌هایی که این صفحه برای آن‌ها طراحی شده؛ در صورت عدم تطابق هشدار ملایم نشان داده می‌شود. */
  expectedRoles?: string[];
  children: React.ReactNode;
};

export function PageFrame({ title, intro, expectedRoles, children }: Props) {
  const { me } = useAuthMe();
  const mismatch =
    me && expectedRoles?.length ? !expectedRoles.includes(me.role) : false;

  return (
    <div>
      <h1 style={{ fontSize: 20, color: "#0E3B13", marginTop: 0, marginBottom: 8 }}>{title}</h1>
      {intro && (
        <div style={{ color: "#4B5563", lineHeight: 1.8, marginBottom: 14, fontSize: 14 }}>{intro}</div>
      )}
      {mismatch && (
        <div
          role="status"
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #F59E0B",
            background: "#FFFBEB",
            fontSize: 13,
            color: "#92400E",
          }}
        >
          برای دادهٔ زنده این بخش توکن با نقش مناسب لازم است. نقش فعلی شما:{" "}
          <strong>{me?.role}</strong>
          {expectedRoles?.length ? (
            <>
              {" "}
              — این صفحه معمولاً برای{" "}
              <strong>{expectedRoles.join("، ")}</strong> استفاده می‌شود.
            </>
          ) : null}
        </div>
      )}
      {children}
    </div>
  );
}
