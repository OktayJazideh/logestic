import React from "react";
import { btnDanger, btnGhost, btnPrimary, btnSecondary } from "../../theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  fullWidth?: boolean;
};

const variants: Record<Variant, React.CSSProperties> = {
  primary: btnPrimary,
  secondary: btnSecondary,
  ghost: btnGhost,
  danger: btnDanger,
};

export function Button({ variant = "primary", fullWidth, style, disabled, children, type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      disabled={disabled}
      style={{
        ...variants[variant],
        width: fullWidth ? "100%" : undefined,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
