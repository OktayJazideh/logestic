import * as eventsRepo from "../../repositories/eventsRepository";
import type { AppEventName } from "../../services/eventBus";

/** Verify / backfill durable event log (EVENT-1 already persists on publish). */
export async function runPersistEvent(payload: Record<string, unknown>) {
  const event_name = String(payload.event_name ?? "");
  const event_id = payload.event_id != null ? Number(payload.event_id) : undefined;
  const correlation_id = payload.correlation_id != null ? String(payload.correlation_id) : undefined;

  if (event_id) {
    const rows = await eventsRepo.listDomainEvents({ limit: 20 });
    const found = rows.some((r) => r.id === event_id);
    if (!found) {
      await eventsRepo.insertDomainEvent({
        event_name: event_name as AppEventName,
        payload: (payload.event_payload ?? payload) as Record<string, unknown>,
        correlation_id,
        occurred_at: new Date(),
        published_by: payload.published_by != null ? Number(payload.published_by) : undefined,
      });
    }
  }

  return { persisted: true, event_name, event_id };
}
