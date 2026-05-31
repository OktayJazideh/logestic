/** Detect tsx/node integration scripts under apps/backend/scripts/. */
export function isIntegrationScript(): boolean {
  const entry = (process.argv[1] ?? "").replace(/\\/g, "/");
  return /\/scripts\/(test-|integration-|duty-)/.test(entry);
}

/** Background timers (nightly reconciliation/KPI) must not run in tests or script harnesses. */
export function shouldStartBackgroundJobs(): boolean {
  if (process.env.NODE_ENV === "test") return false;
  if (process.env.SKIP_BACKGROUND_JOBS === "1" || process.env.SKIP_BACKGROUND_JOBS === "true") return false;
  if (isIntegrationScript()) return false;
  return true;
}
