/**
 * SET-CYCLE-1 — local timezone for daily settlement cron (02:00).
 * Default Asia/Tehran (Iran); override via SETTLEMENT_CRON_TZ env.
 */
export const SETTLEMENT_CRON_TZ = process.env.SETTLEMENT_CRON_TZ ?? "Asia/Tehran";

export type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

/** Calendar parts in settlement cron timezone. */
export function localDateParts(at: Date, tz = SETTLEMENT_CRON_TZ): LocalDateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

export function isFirstDayOfMonth(at: Date, tz = SETTLEMENT_CRON_TZ): boolean {
  return localDateParts(at, tz).day === 1;
}

/** Fixed N-day bucket bounds (epoch-aligned) for owner weekly idempotency. */
export function ownerPeriodBounds(at: Date, periodDays: number): { periodStart: Date; periodEnd: Date; bucket: number } {
  const msPerDay = 86_400_000;
  const bucketMs = periodDays * msPerDay;
  const currentBucket = Math.floor(at.getTime() / bucketMs);
  const prevBucket = currentBucket - 1;
  const periodStart = new Date(prevBucket * bucketMs);
  const periodEnd = new Date((prevBucket + 1) * bucketMs - 1);
  return { periodStart, periodEnd, bucket: prevBucket };
}

export function monthBoundsUtc(year: number, month: number) {
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { periodStart, periodEnd };
}
