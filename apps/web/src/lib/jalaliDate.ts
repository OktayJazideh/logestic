/**
 * تبدیل و نمایش تاریخ جلالی — کتابخانه jalaali-js
 */
import jalaali from "jalaali-js";

const PERSIAN_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

export type JalaliParts = { jy: number; jm: number; jd: number };

export function gregorianToJalali(date: Date): JalaliParts {
  const { jy, jm, jd } = jalaali.toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
  return { jy, jm, jd };
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): Date {
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);
  return new Date(gy, gm - 1, gd, 12, 0, 0, 0);
}

export function dateToIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isoDateToDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatJalaliDate(isoOrDate: string | Date, opts?: { withWeekday?: boolean }): string {
  const d = typeof isoOrDate === "string" ? isoDateToDate(isoOrDate.slice(0, 10)) : isoOrDate;
  if (!d) return typeof isoOrDate === "string" ? isoOrDate : "—";
  const j = gregorianToJalali(d);
  const base = `${j.jd.toLocaleString("fa-IR")} ${PERSIAN_MONTHS[j.jm - 1]} ${j.jy.toLocaleString("fa-IR")}`;
  if (opts?.withWeekday) {
    return `${d.toLocaleDateString("fa-IR", { weekday: "long" })} ${base}`;
  }
  return base;
}

export function formatJalaliDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const datePart = formatJalaliDate(d);
  const time = d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
  return `${datePart}، ${time}`;
}

export function formatPeriodKeyYm(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1, 12, 0, 0);
  const j = gregorianToJalali(d);
  return `${PERSIAN_MONTHS[j.jm - 1]} ${j.jy.toLocaleString("fa-IR")}`;
}

export function jalaliMonthLength(jy: number, jm: number): number {
  return jalaali.jalaaliMonthLength(jy, jm);
}

export function todayIsoDate(): string {
  return dateToIsoDate(new Date());
}

export function todayGregorianYm(): { year: number; month: number } {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return dateToIsoDate(d);
}

export function todayJalali(): JalaliParts {
  return gregorianToJalali(new Date());
}

export function jalaliPartsToIso(jy: number, jm: number, jd: number): string {
  return dateToIsoDate(jalaliToGregorian(jy, jm, jd));
}

export function isoToJalaliParts(iso: string): JalaliParts | null {
  const d = isoDateToDate(iso);
  if (!d) return null;
  return gregorianToJalali(d);
}

export { PERSIAN_MONTHS };
