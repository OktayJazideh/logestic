/**
 * تبدیل و نمایش تاریخ شمسی (جلالی) — بدون وابستگی خارجی.
 * الگوریتم مطابق jalaali-js (BSD).
 */

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

function div(a: number, b: number) {
  return ~~(a / b);
}

function jalCal(jy: number) {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192,
    2262, 2328, 2334, 2364, 2381, 2397, 2401, 2437, 2451, 2473, 2486, 2489, 2493, 2510,
  ];
  let bl = breaks.length;
  let gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jm = 0;
  let jump = 0;
  for (let i = 1; i < bl; i += 1) {
    const jmBreak = breaks[i];
    jump = jmBreak - jp;
    if (jy < jmBreak) break;
    leapJ += div(jump, 33) * 8 + div((jump % 33), 4);
    jp = jmBreak;
    jm = i;
  }
  const n = jy - jp;
  leapJ += div(n, 33) * 8 + div((n % 33) + 3, 4);
  if ((jump % 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  return { gy, march };
}

function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function g2d(gy: number, gm: number, gd: number) {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * ((gm + 9) % 12) + 2, 5) +
    gd -
    34840408;
  d -= div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4);
  return d + 752;
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div((j % 1461), 4) * 5 + 308;
  const gd = div((i % 153), 5) + 1;
  const gm = div(i, 153) % 12 + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function d2j(jdn: number): JalaliParts {
  const g = d2g(jdn);
  let jy = g.gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(g.gy, 3, r.march);
  let k = jdn - jdn1f;
  if (k < 0) {
    jy -= 1;
    k += 365;
  }
  let jm = k < 186 ? 1 + div(k, 31) : 7 + div(k - 186, 30);
  const jd = 1 + (k < 186 ? k % 31 : (k - 186) % 30);
  return { jy, jm, jd };
}

function g2j(gy: number, gm: number, gd: number): JalaliParts {
  return d2j(g2d(gy, gm, gd));
}

function j2g(jy: number, jm: number, jd: number) {
  return d2g(j2d(jy, jm, jd));
}

export function gregorianToJalali(date: Date): JalaliParts {
  return g2j(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): Date {
  const g = j2g(jy, jm, jd);
  return new Date(g.gy, g.gm - 1, g.gd, 12, 0, 0, 0);
}

/** ISO تاریخ میلادی YYYY-MM-DD از Date محلی */
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

/** کلید دوره میلادی YYYY-MM → برچسب شمسی */
export function formatPeriodKeyYm(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1, 12, 0, 0);
  const j = gregorianToJalali(d);
  return `${PERSIAN_MONTHS[j.jm - 1]} ${j.jy.toLocaleString("fa-IR")}`;
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return j2d(jy + 1, 1, 1) - j2d(jy, 1, 1) > 365 ? 30 : 29;
}

export function todayIsoDate(): string {
  return dateToIsoDate(new Date());
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
