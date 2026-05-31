import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

export type IdempotencyRow = {
  key: string;
  route: string;
  request_hash: string;
  response_body: unknown;
  status_code: number | null;
  created_at: Date;
};

const TTL_MS = 24 * 60 * 60 * 1000;

function mapRow(r: {
  key: string;
  route: string;
  request_hash: string;
  response_body: unknown;
  status_code: number | null;
  created_at: Date;
}): IdempotencyRow {
  return {
    key: r.key,
    route: r.route,
    request_hash: r.request_hash,
    response_body: r.response_body,
    status_code: r.status_code,
    created_at: r.created_at,
  };
}

export async function purgeExpiredIdempotencyKeys(ttlMs: number = TTL_MS): Promise<void> {
  const cutoff = new Date(Date.now() - ttlMs);
  await prisma.idempotency_keys.deleteMany({
    where: { created_at: { lt: cutoff } },
  });
}

export async function findIdempotencyKey(key: string, route: string): Promise<IdempotencyRow | null> {
  const row = await prisma.idempotency_keys.findUnique({
    where: { key_route: { key, route } },
  });
  if (!row) return null;
  if (row.created_at.getTime() < Date.now() - TTL_MS) {
    await prisma.idempotency_keys.delete({ where: { key_route: { key, route } } }).catch(() => undefined);
    return null;
  }
  return mapRow(row);
}

export async function tryAcquireIdempotencyKey(params: {
  key: string;
  route: string;
  request_hash: string;
}): Promise<boolean> {
  try {
    await prisma.idempotency_keys.create({
      data: {
        key: params.key,
        route: params.route,
        request_hash: params.request_hash,
        status_code: null,
      },
    });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return false;
    }
    throw e;
  }
}

export async function completeIdempotencyKey(params: {
  key: string;
  route: string;
  status_code: number;
  response_body: unknown;
}): Promise<void> {
  await prisma.idempotency_keys.update({
    where: { key_route: { key: params.key, route: params.route } },
    data: {
      status_code: params.status_code,
      response_body: params.response_body as Prisma.InputJsonValue,
    },
  });
}

export async function deleteIdempotencyKey(key: string, route: string): Promise<void> {
  await prisma.idempotency_keys
    .delete({ where: { key_route: { key, route } } })
    .catch(() => undefined);
}
