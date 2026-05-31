import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { toBig, toNum } from "./id";

export type DomainEventRow = {
  id: number;
  event_name: string;
  payload: Record<string, unknown>;
  correlation_id?: string;
  occurred_at: Date;
  published_by?: number;
};

type Tx = Prisma.TransactionClient;

function mapRow(r: {
  id: bigint;
  event_name: string;
  payload: unknown;
  correlation_id: string | null;
  occurred_at: Date;
  published_by: bigint | null;
}): DomainEventRow {
  return {
    id: toNum(r.id),
    event_name: r.event_name,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    correlation_id: r.correlation_id ?? undefined,
    occurred_at: r.occurred_at,
    published_by: r.published_by != null ? toNum(r.published_by) : undefined,
  };
}

export async function insertDomainEvent(
  params: {
    event_name: string;
    payload: Record<string, unknown>;
    correlation_id?: string;
    occurred_at?: Date;
    published_by?: number;
  },
  tx?: Tx,
): Promise<DomainEventRow> {
  const db = tx ?? prisma;
  const r = await db.events.create({
    data: {
      event_name: params.event_name,
      payload: params.payload as object,
      correlation_id: params.correlation_id,
      occurred_at: params.occurred_at ?? new Date(),
      published_by: params.published_by != null ? toBig(params.published_by) : null,
    },
  });
  return mapRow(r);
}

export async function listDomainEvents(params?: {
  event_name?: string;
  limit?: number;
}): Promise<DomainEventRow[]> {
  const rows = await prisma.events.findMany({
    where: params?.event_name ? { event_name: params.event_name } : undefined,
    orderBy: { occurred_at: "desc" },
    take: params?.limit ?? 50,
  });
  return rows.map(mapRow);
}

export async function deleteAllDomainEventsForTests(): Promise<void> {
  await prisma.events.deleteMany();
}

export async function countDomainEventsByName(event_name: string): Promise<number> {
  return prisma.events.count({ where: { event_name } });
}
