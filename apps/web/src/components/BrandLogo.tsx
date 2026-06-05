import React from "react";
import { brandNames } from "../brand";
import { brand } from "../theme";

type BrandLogoProps = {
  variant?: "mark" | "full";
  size?: number;
  /** On dark header backgrounds */
  onDark?: boolean;
};

export function BrandLogo({ variant = "mark", size = 36, onDark = false }: BrandLogoProps) {
  const titleColor = onDark ? "#FFFFFF" : brand.primaryDark;
  const subColor = onDark ? brand.accentLight : brand.textMuted;

  if (variant === "mark") {
    return (
      <img
        src="/logo-mark.png"
        alt={brandNames.master}
        width={size}
        height={size}
        style={{ display: "block", borderRadius: 8 }}
      />
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <img
        src="/logo-mark.png"
        alt=""
        width={size}
        height={size}
        style={{ display: "block", borderRadius: 8 }}
        aria-hidden
      />
      <div>
        <div style={{ fontWeight: 700, fontSize: size * 0.42, color: titleColor, lineHeight: 1.2 }}>
          {brandNames.master}
        </div>
        <div style={{ fontSize: size * 0.28, color: subColor, lineHeight: 1.3 }}>{brandNames.product}</div>
      </div>
    </div>
  );
}
