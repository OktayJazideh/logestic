import React from "react";
import { useAuthMe } from "../hooks/useAuthMe";
import { PanelNotFound } from "./PanelNotFound";
import { brand, fontSize, space } from "../theme";

type Props = {
  title: string;
  intro?: React.ReactNode;
  /** نقش‌هایی که این صفحه برای آن‌ها طراحی شده؛ در صورت عدم تطابق 404 نشان داده می‌شود. */
  expectedRoles?: string[];
  children: React.ReactNode;
};

export function PageFrame({ title, intro, expectedRoles, children }: Props) {
  const { me } = useAuthMe();
  const mismatch =
    me && expectedRoles?.length ? !expectedRoles.includes(me.role) : false;

  if (mismatch) {
    return <PanelNotFound />;
  }

  return (
    <div className="panel-page">
      <h1
        style={{
          fontSize: fontSize.title,
          color: brand.primaryDark,
          marginTop: 0,
          marginBottom: space.sm,
          fontWeight: 700,
          lineHeight: 1.3,
        }}
      >
        {title}
      </h1>
      {intro && <div className="panel-page__intro">{intro}</div>}
      {children}
    </div>
  );
}
