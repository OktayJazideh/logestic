import React from "react";
import { brand, sectionStyle } from "../../theme";

type Props = {
  title?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export function Section({ title, children, style }: Props) {
  return (
    <section style={{ ...sectionStyle, ...style }}>
      {title && (
        <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: brand.primaryDark }}>{title}</h2>
      )}
      {children}
    </section>
  );
}
