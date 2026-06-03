import React, { useId } from "react";
import DatePicker from "react-multi-date-picker";
import DateObject from "react-date-object";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import { dateToIsoDate, isoDateToDate } from "../lib/jalaliDate";
import { brand, fontSize, inputStyle, radius } from "../theme";

type Props = {
  /** تاریخ میلادی برای API: YYYY-MM-DD */
  value: string;
  onChange: (isoDate: string) => void;
  label?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  "data-testid"?: string;
};

function isoToDateObject(iso: string): DateObject | undefined {
  const d = isoDateToDate(iso);
  if (!d) return undefined;
  return new DateObject({ date: d, calendar: persian, locale: persian_fa });
}

function dateObjectToIso(obj: DateObject): string {
  const js = obj.toDate();
  return dateToIsoDate(js);
}

export function JalaliDatePicker({
  value,
  onChange,
  label,
  disabled,
  style,
  "data-testid": testId,
}: Props) {
  const id = useId();
  const pickerValue = value ? isoToDateObject(value) : undefined;

  return (
    <div style={style} data-testid={testId}>
      {label && (
        <label
          htmlFor={id}
          style={{
            display: "block",
            fontSize: fontSize.sm,
            fontWeight: 600,
            marginBottom: 8,
            color: brand.primaryDark,
          }}
        >
          {label}
        </label>
      )}
      <DatePicker
        id={id}
        disabled={disabled}
        calendar={persian}
        locale={persian_fa}
        format="YYYY/MM/DD"
        value={pickerValue}
        onChange={(d) => {
          if (!d) return;
          const obj = Array.isArray(d) ? d[0] : d;
          if (obj instanceof DateObject) onChange(dateObjectToIso(obj));
        }}
        containerStyle={{ width: "100%" }}
        inputClass="jalali-date-input"
        style={{
          ...inputStyle,
          width: "100%",
          borderRadius: radius.md,
        }}
        calendarPosition="bottom-right"
        arrow={false}
      />
    </div>
  );
}
