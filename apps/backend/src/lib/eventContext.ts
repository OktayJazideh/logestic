import { AsyncLocalStorage } from "node:async_hooks";

export type EventPublishContext = {
  correlationId?: string;
  publishedBy?: number;
};

const storage = new AsyncLocalStorage<EventPublishContext>();

export function runWithEventContext<T>(ctx: EventPublishContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getEventContext(): EventPublishContext {
  return storage.getStore() ?? {};
}

export function setEventContext(patch: Partial<EventPublishContext>) {
  const current = storage.getStore();
  if (current) {
    Object.assign(current, patch);
  }
}
