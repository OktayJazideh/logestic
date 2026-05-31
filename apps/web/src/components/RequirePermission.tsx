import React from "react";
import { Navigate } from "react-router-dom";
import { useAuthMe } from "../hooks/useAuthMe";

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
      <div style={{ padding: 24, color: "#6B7280", fontSize: 14, textAlign: "center" }}>
        در حال بررسی دسترسی…
      </div>
    );
  }

  if (required.length > 0 && !can(required)) {
    return <Navigate to="/panel" replace />;
  }

  return <>{children}</>;
}
