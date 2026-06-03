import React from "react";
import { useAuthMe } from "../hooks/useAuthMe";
import { PanelNotFound } from "./PanelNotFound";

type Props = {
  permission?: string;
  permissions?: string[];
  children: React.ReactNode;
};

export function RequirePermission({ permission, permissions, children }: Props) {
  const { ready, can } = useAuthMe();
  const required = permissions ?? (permission ? [permission] : []);

  if (!ready) {
    return (
      <div style={{ padding: 24, textAlign: "center", fontSize: 14, color: "#6B7280" }}>
        در حال بررسی دسترسی…
      </div>
    );
  }

  if (required.length > 0 && !can(required)) {
    return <PanelNotFound />;
  }

  return <>{children}</>;
}
