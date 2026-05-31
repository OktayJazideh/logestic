/** Community-pool period key from settlement.period_days (default: calendar month). */
export function computePeriodKey(at: Date, periodDays: number): string {
  if (periodDays >= 28 && periodDays <= 31) {
    return at.toISOString().slice(0, 7);
  }
  const msPerDay = 86_400_000;
  const bucket = Math.floor(at.getTime() / (periodDays * msPerDay));
  return `P${periodDays}:${bucket}`;
}
