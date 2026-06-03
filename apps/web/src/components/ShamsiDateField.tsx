import React, { useEffect, useId, useMemo, useState } from "react";
import {
  isoToJalaliParts,
  jalaliMonthLength,
  jalaliPartsToIso,
  PERSIAN_MONTHS,
  todayJalali,
} from "../lib/jalaliDate";
import { brand } from "../theme";

type Props = {
  /** تاریخ میلادی برای API: YYYY-MM-DD */
  value: string;
  onChange: (isoDate: string) => void;
  label?: string;
  disabled?: boolean;
  minJy?: number;
  maxJy?: number;
  style?: React.CSSProperties;
  "data-testid"?: string;
};

const selectStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  border: `1px solid ${brand.border}`,
  fontFamily: brand.fontFamily,
  fontSize: 14,
  background: brand.panel,
};

export function ShamsiDateField({
  value,
  onChange,
  label,
  disabled,
  minJy,
  maxJy,
  style,
  "data-testid": testId,
}: Props) {
  const id = useId();
  const today = todayJalali();
  const minYear = minJy ?? today.jy - 5;
  const maxYear = maxJy ?? today.jy + 2;

  const initial = useMemo(() => isoToJalaliParts(value) ?? today, [value]);
  const [jy, setJy] = useState(initial.jy);
  const [jm, setJm] = useState(initial.jm);
  const [jd, setJd] = useState(initial.jd);

  useEffect(() => {
    const p = isoToJalaliParts(value);
    if (p) {
      setJy(p.jy);
      setJm(p.jm);
      setJd(p.jd);
    }
  }, [value]);

  function emit(nextJy: number, nextJm: number, nextJd: number) {
    const maxDay = jalaliMonthLength(nextJy, nextJm);
    const safeDay = Math.min(nextJd, maxDay);
    setJy(nextJy);
    setJm(nextJm);
    setJd(safeDay);
    onChange(jalaliPartsToIso(nextJy, nextJm, safeDay));
  }

  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y -= 1) years.push(y);

  const daysInMonth = jalaliMonthLength(jy, jm);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div style={style} data-testid={testId}>
      {label && (
        <label htmlFor={id} style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          {label}
        </label>
      )}
      <div id={id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <select
          aria-label="روز"
          disabled={disabled}
          value={jd}
          onChange={(e) => emit(jy, jm, Number(e.target.value))}
          style={selectStyle}
        >
          {days.map((d) => (
            <option key={d} value={d}>
              {d.toLocaleString("fa-IR")}
            </option>
          ))}
        </select>
        <select
          aria-label="ماه"
          disabled={disabled}
          value={jm}
          onChange={(e) => emit(jy, Number(e.target.value), jd)}
          style={{ ...selectStyle, minWidth: 120 }}
        >
          {PERSIAN_MONTHS.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label="سال"
          disabled={disabled}
          value={jy}
          onChange={(e) => emit(Number(e.target.value), jm, jd)}
          style={selectStyle}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y.toLocaleString("fa-IR")}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
