import { computeDailyKpis } from "../../services/kpiService";

/** KPI-1: daily snapshot job — fleet efficiency, delay, hold, utilization, failed settlement. */
export async function runDailyKpiSnapshot(payload: Record<string, unknown>) {
  const dateStr = typeof payload.date === "string" ? payload.date : undefined;
  const mineId = typeof payload.mine_id === "number" ? payload.mine_id : undefined;
  const date = dateStr ? new Date(`${dateStr}T00:00:00.000Z`) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await computeDailyKpis(date, mineId);
  return result;
}
