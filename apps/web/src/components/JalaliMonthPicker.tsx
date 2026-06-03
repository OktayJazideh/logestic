import React, { useId } from "react";
import DatePicker from "react-multi-date-picker";
import DateObject from "react-date-object";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import { formatPeriodKeyYm } from "../lib/jalaliDate";
import { brand } from "../theme";
import "react-multi-date-picker/styles/colors/green.css";

type Props = {
  /** سال و ماه میلادی (۱–۱۲) برای API */
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
  label?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  "data-testid"?: string;
};

function gregorianYmToPickerValue(year: number, month: number): DateObject {
  return new DateObject({
    date: new Date(year, month - 1, 1, 12, 0, 0, 0),
    calendar: persian,
    locale: persian_fa,
  });
}

function pickerValueToGregorianYm(obj: DateObject): { year: number; month: number } {
  const js = obj.toDate();
  return { year: js.getFullYear(), month: js.getMonth() + 1 };
}

export function JalaliMonthPicker({
  year,
  month,
  onChange,
  label,
  disabled,
  style,
  "data-testid": testId,
}: Props) {
  const id = useId();
  const pickerValue = gregorianYmToPickerValue(year, month);
  const periodLabel = formatPeriodKeyYm(`${year}-${String(month).padStart(2, "0")}`);

  return (
    <div style={style} data-testid={testId}>
      {label && (
        <label htmlFor={id} style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          {label}
        </label>
      )}
      <DatePicker
        id={id}
        disabled={disabled}
        onlyMonthPicker
        calendar={persian}
        locale={persian_fa}
        format="MMMM YYYY"
        value={pickerValue}
        onChange={(d) => {
          if (!d) return;
          const obj = Array.isArray(d) ? d[0] : d;
          if (obj instanceof DateObject) {
            const { year: y, month: m } = pickerValueToGregorianYm(obj);
            onChange(y, m);
          }
        }}
        containerStyle={{ width: "100%" }}
        inputClass="jalali-date-input"
        style={{
          width: "100%",
          minWidth: 160,
          padding: "8px 10px",
          borderRadius: 6,
          border: `1px solid ${brand.border}`,
          fontFamily: brand.fontFamily,
          fontSize: 14,
          background: brand.panel,
        }}
        calendarPosition="bottom-right"
        arrow={false}
      />
      <span style={{ display: "block", fontSize: 11, color: brand.textMuted, marginTop: 4 }}>
        دوره میلادی: {periodLabel}
      </span>
    </div>
  );
}
