import React from "react";
import { useAuthMe } from "../hooks/useAuthMe";
import { roleLabelFa } from "../lib/roleLabels";

function expectedRolesFa(roles: string[]): string {
  return roles.map((r) => roleLabelFa(r)).join("، ");
}
import { brand } from "../theme";

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
      <h1 style={{ fontSize: 20, color: brand.primaryDark, marginTop: 0, marginBottom: 8, fontWeight: 700 }}>
        {title}
      </h1>
      {intro && (
        <div style={{ color: brand.textMuted, lineHeight: 1.8, marginBottom: 14, fontSize: 14 }}>{intro}</div>
      )}
      {mismatch && (
        <div
          role="status"
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 6,
            border: `1px solid ${brand.warnBorder}`,
            background: brand.warnBg,
            fontSize: 13,
            color: brand.warn,
          }}
        >
          این صفحه معمولاً برای «{expectedRolesFa(expectedRoles!)}» است. نقش فعلی شما:{" "}
          <strong>{roleLabelFa(me?.role)}</strong>
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
