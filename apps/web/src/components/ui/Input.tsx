import React from "react";
import { brand, inputStyle, selectStyle } from "../../theme";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean;
};

export function Input({ hasError, style, ...rest }: Props) {
  return (
    <input
      style={{
        ...inputStyle,
        borderColor: hasError ? brand.danger : brand.border,
        ...style,
      }}
      {...rest}
    />
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  hasError?: boolean;
};

export function Select({ hasError, style, children, ...rest }: SelectProps) {
  return (
    <select
      style={{
        ...selectStyle,
        borderColor: hasError ? brand.danger : brand.border,
        ...style,
      }}
      {...rest}
    >
      {children}
    </select>
  );
}
