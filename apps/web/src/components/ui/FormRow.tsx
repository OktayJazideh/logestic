import React from "react";
import { sectionStyle, space } from "../../theme";
import { FilterBar, FilterField } from "./FilterBar";

type Props = {
  children: React.ReactNode;
  actions?: React.ReactNode;
  as?: "div" | "form";
  onSubmit?: React.FormEventHandler<HTMLFormElement>;
  style?: React.CSSProperties;
  noValidate?: boolean;
};

/** فرم افقی با دکمه‌های actions در همان ردیف */
export function FormRow({ children, actions, as = "div", onSubmit, style, noValidate }: Props) {
  const inner = (
    <FilterBar style={{ marginBottom: 0, ...style }}>
      {children}
      {actions != null && (
        <FilterField style={{ minWidth: "auto" }}>
          <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>{actions}</div>
        </FilterField>
      )}
    </FilterBar>
  );

  if (as === "form") {
    return (
      <form
        noValidate={noValidate}
        onSubmit={onSubmit}
        style={{
          ...sectionStyle,
          marginBottom: space.lg,
        }}
      >
        {inner}
      </form>
    );
  }

  return <div style={{ marginBottom: space.lg }}>{inner}</div>;
}

export { FilterField };
