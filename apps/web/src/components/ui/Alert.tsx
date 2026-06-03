import React from "react";
import { alertStyle, type AlertVariant } from "../../theme";

type Props = {
  variant?: AlertVariant;
  children: React.ReactNode;
  role?: "alert" | "status";
  style?: React.CSSProperties;
};

export function Alert({ variant = "info", children, role = "status", style }: Props) {
  return (
    <div role={role} style={{ ...alertStyle(variant), ...style }}>
      {children}
    </div>
  );
}
