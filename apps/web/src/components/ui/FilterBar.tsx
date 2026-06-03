import React from "react";
import { space } from "../../theme";

type Props = {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
};

/** نوار فیلتر/ابزار — همه کنترل‌ها روی baseline پایین هم‌تراز */
export function FilterBar({ children, style }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-end",
        gap: space.md,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** یک ستون در FilterBar / FormRow با ارتفاع یکنواخت */
export function FilterField({
  children,
  style,
  minWidth,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  minWidth?: number | string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        minWidth: minWidth ?? 140,
        flex: "0 1 auto",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
