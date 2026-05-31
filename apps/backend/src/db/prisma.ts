import { PrismaClient } from "@prisma/client";
import {
  isSoftDeleteBypassed,
  isSoftDeleteModel,
  mergeDeletedAtFilter,
  runWithSoftDeleteBypass,
} from "../lib/softDelete";

const READ_ACTIONS = new Set([
  "findUnique",
  "findFirst",
  "findMany",
  "count",
  "aggregate",
]);
const WRITE_FILTER_ACTIONS = new Set(["update", "updateMany", "delete", "deleteMany"]);

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

function applySoftDeleteMiddleware(client: PrismaClient): void {
  client.$use(async (params, next) => {
    const model = params.model;
    if (!model || !isSoftDeleteModel(model) || isSoftDeleteBypassed()) {
      return next(params);
    }

    if (params.action === "delete") {
      params.action = "update";
      params.args = { ...params.args, data: { deleted_at: new Date() } };
      return next(params);
    }

    if (params.action === "deleteMany") {
      params.action = "updateMany";
      params.args = {
        ...params.args,
        where: mergeDeletedAtFilter(params.args?.where),
        data: { deleted_at: new Date() },
      };
      return next(params);
    }

    if (READ_ACTIONS.has(params.action) || WRITE_FILTER_ACTIONS.has(params.action)) {
      const args = { ...(params.args ?? {}) } as { where?: Record<string, unknown> };
      if (params.action === "findUnique") {
        params.action = "findFirst";
      }
      if (args.where !== undefined || ["findMany", "count", "aggregate", "updateMany"].includes(params.action)) {
        args.where = mergeDeletedAtFilter(args.where);
        params.args = args;
      }
    }

    if (params.action === "upsert") {
      const args = params.args as {
        where: Record<string, unknown>;
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      };
      const delegate = (client as unknown as Record<string, { findUnique: (a: unknown) => Promise<{ deleted_at?: Date | null } | null> }>)[
        model
      ];
      const existing = await runWithSoftDeleteBypass(() => delegate.findUnique({ where: args.where }));
      if (existing?.deleted_at != null) {
        return runWithSoftDeleteBypass(() =>
          next({
            ...params,
            action: "update",
            args: {
              where: args.where,
              data: { ...args.update, deleted_at: null },
            },
          }),
        );
      }
      if (existing) {
        params.action = "update";
        params.args = { where: args.where, data: args.update };
        return next(params);
      }
      params.action = "create";
      params.args = { data: args.create };
      return next(params);
    }

    return next(params);
  });
}

/** Cap pool size in dev/test so zombie `tsx`/test processes do not exhaust Postgres max_connections. */
function datasourceUrlWithPoolLimit(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  const limit =
    process.env.PRISMA_CONNECTION_LIMIT ??
    (process.env.NODE_ENV === "production" ? undefined : "5");
  if (!limit) return raw;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", limit);
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "10");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function createPrismaClient(): PrismaClient {
  const datasourceUrl = datasourceUrlWithPoolLimit();
  const client = new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  applySoftDeleteMiddleware(client);
  return client;
}

/** Application Prisma client with automatic <code>deleted_at IS NULL</code> filter. */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

/** Alias for bypass writes — same instance; use {@link runWithSoftDeleteBypass}. */
export const prismaBase = prisma;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
} else {
  globalForPrisma.prisma ??= prisma;
}
