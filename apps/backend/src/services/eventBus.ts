import { EventEmitter } from "node:events";
import * as eventsRepo from "../repositories/eventsRepository";
import type { AuditLogStore } from "../stores/auditLogStore";
import { getEventContext } from "../lib/eventContext";

/** EVENT-1 — canonical domain event names (dot notation). */
export const APP_EVENT_NAMES = [
  "mission.created",
  "mission.assigned",
  "mission.accepted",
  "mission.delivered",
  "mission.verified",
  "mission.settled",
  "mission.redispatched",
  "weighbridge.weights_submitted",
  "weighbridge.agent_ingest",
  "weighbridge.approved",
  "weighbridge.anomaly",
  "weighbridge.adjustment_approved",
  "settlement.calculated",
  "settlement.in_bank_queue",
  "settlement.settled",
  "settlement.failed",
  "payout.completed",
  "payout.failed",
  "kyc.household_approved",
  "kyc.driver_approved",
  "kyc.cooperative_verified",
  "payment.hold",
  "payment.release",
  "payment.reverse",
  "payment.failed",
] as const;

export type AppEventName = (typeof APP_EVENT_NAMES)[number];

const EVENT_NAME_SET = new Set<string>(APP_EVENT_NAMES);

export type DomainEvent = {
  id?: number;
  event_name: AppEventName;
  payload: Record<string, unknown>;
  correlation_id?: string;
  occurred_at: string;
  published_by?: number;
};

export type PublishOptions = {
  correlation_id?: string;
  published_by?: number;
  occurred_at?: Date;
  /** Skip DB persist (tests only). */
  skipPersist?: boolean;
};

export type EventHandler = (event: DomainEvent) => void | Promise<void>;

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

const recent: DomainEvent[] = [];
const MAX_RECENT = 500;

let auditStoreRef: AuditLogStore | null = null;
let initialized = false;

const queueConsumers: EventHandler[] = [];
const notificationConsumers: EventHandler[] = [];

function isAppEventName(name: string): name is AppEventName {
  return EVENT_NAME_SET.has(name);
}

function entityIdFromPayload(payload: Record<string, unknown>): string {
  const keys = [
    "mission_id",
    "batch_id",
    "ticket_id",
    "household_id",
    "driver_id",
    "cooperative_id",
    "adjustment_id",
    "need_id",
  ];
  for (const key of keys) {
    const v = payload[key];
    if (v != null && v !== "") return String(v);
  }
  return "global";
}

async function persistEvent(event: DomainEvent, opts?: PublishOptions): Promise<DomainEvent> {
  if (opts?.skipPersist) return event;
  const row = await eventsRepo.insertDomainEvent({
    event_name: event.event_name,
    payload: event.payload,
    correlation_id: event.correlation_id,
    occurred_at: new Date(event.occurred_at),
    published_by: event.published_by,
  });
  return { ...event, id: row.id };
}

function pushRecent(event: DomainEvent) {
  recent.push(event);
  if (recent.length > MAX_RECENT) recent.shift();
}

async function runHandlers(handlers: EventHandler[], event: DomainEvent) {
  for (const handler of handlers) {
    try {
      await handler(event);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[eventBus] handler error for ${event.event_name}`, err);
    }
  }
}

async function emitToSubscribers(event: DomainEvent) {
  emitter.emit(event.event_name, event);
  emitter.emit("*", event);
  await runHandlers(queueConsumers, event);
  await runHandlers(notificationConsumers, event);
}

async function auditDomainEvent(event: DomainEvent) {
  if (!auditStoreRef) return;
  await auditStoreRef.record({
    entity_type: "domain_event",
    entity_id: entityIdFromPayload(event.payload),
    action: event.event_name,
    after_value: {
      event_id: event.id,
      payload: event.payload,
      correlation_id: event.correlation_id,
      published_by: event.published_by,
      occurred_at: event.occurred_at,
    },
    performed_by_user_id: event.published_by,
    reason: "event_bus_audit",
  });
}

/** Register audit-only subscriber (default at init). */
function registerAuditSubscriber() {
  emitter.on("*", (event: DomainEvent) => {
    void auditDomainEvent(event);
  });
}

/**
 * QUEUE-1 hook: register async worker handlers (not wired yet).
 */
export function registerQueueConsumer(handler: EventHandler) {
  queueConsumers.push(handler);
}

/**
 * NOTIF-1 hook: register notification handlers (not wired yet).
 */
export function registerNotificationConsumer(handler: EventHandler) {
  notificationConsumers.push(handler);
}

/** Subscribe to a single event or all events via `"*"`. */
export function onDomainEvent(eventName: AppEventName | "*", handler: EventHandler) {
  emitter.on(eventName, handler);
}

export function initEventBus(auditStore: AuditLogStore) {
  if (initialized) return;
  auditStoreRef = auditStore;
  registerAuditSubscriber();
  initialized = true;
}

export async function publishEvent(
  eventName: AppEventName,
  payload: Record<string, unknown>,
  opts?: PublishOptions,
): Promise<DomainEvent> {
  if (!isAppEventName(eventName)) {
    throw new Error(`Unknown domain event: ${eventName}`);
  }

  const ctx = getEventContext();
  const correlation_id = opts?.correlation_id ?? ctx.correlationId;
  const published_by = opts?.published_by ?? ctx.publishedBy;
  const occurred_at = (opts?.occurred_at ?? new Date()).toISOString();

  let event: DomainEvent = {
    event_name: eventName,
    payload,
    correlation_id,
    published_by,
    occurred_at,
  };

  event = await persistEvent(event, opts);
  pushRecent(event);
  await emitToSubscribers(event);

  return event;
}

/** @deprecated Use `event_name` on DomainEvent; kept for older tests. */
export type AppEvent = DomainEvent & { type: AppEventName };

export function listRecentEvents(limit = 50): DomainEvent[] {
  return recent.slice(-limit);
}

export async function listPersistedEvents(limit = 50) {
  return eventsRepo.listDomainEvents({ limit });
}

export function clearEventsForTests() {
  recent.length = 0;
}

export async function clearPersistedEventsForTests() {
  await eventsRepo.deleteAllDomainEventsForTests();
}

export function resetEventBusForTests() {
  recent.length = 0;
  queueConsumers.length = 0;
  notificationConsumers.length = 0;
  emitter.removeAllListeners();
  initialized = false;
  auditStoreRef = null;
}
