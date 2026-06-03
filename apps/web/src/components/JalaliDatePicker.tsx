import React, { useId } from "react";
import DatePicker from "react-multi-date-picker";
import DateObject from "react-date-object";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import { dateToIsoDate, isoDateToDate } from "../lib/jalaliDate";
import { brand } from "../theme";
import "react-multi-date-picker/styles/colors/green.css";

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
        <label htmlFor={id} style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
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
          width: "100%",
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
    </div>
  );
}
