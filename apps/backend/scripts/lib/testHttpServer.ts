import type { Server } from "node:http";
import { createApp } from "../../src/app";
import { initAppContext, shutdownAppContext } from "../../src/lib/appInit";
import { prisma } from "../../src/db/prisma";

let baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:4000";
let ephemeralServer: Server | null = null;
let serverReady = false;
const extraServers = new Set<Server>();

export function getTestBaseUrl() {
  return baseUrl;
}

export async function ensureTestHttpServer() {
  if (serverReady) return baseUrl;
  try {
    const probe = await fetch(`${baseUrl}/api/health/z`, { signal: AbortSignal.timeout(2000) });
    if (probe.ok) {
      serverReady = true;
      return baseUrl;
    }
  } catch {
    /* start embedded server */
  }
  await initAppContext();
  const app = createApp();
  ephemeralServer = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
  extraServers.add(ephemeralServer);
  const addr = ephemeralServer.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
  serverReady = true;
  return baseUrl;
}

/** Register an HTTP server started outside this module so shutdown can close it. */
export function registerTestHttpServer(server: Server) {
  extraServers.add(server);
}

export async function testFetch(path: string, init?: RequestInit) {
  const root = await ensureTestHttpServer();
  const res = await fetch(`${root}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

export async function shutdownTestRuntime() {
  const closing = [...extraServers];
  extraServers.clear();
  ephemeralServer = null;
  serverReady = false;
  await Promise.all(
    closing.map(async (s) => {
      try {
        await closeServer(s);
      } catch {
        /* already closed */
      }
    }),
  );
  await shutdownAppContext();
}

/**
 * Run an integration script and exit cleanly (no hanging timers / open handles).
 * Use in scripts/test-*.ts instead of bare main().finally(prisma.$disconnect).
 */
export function runIntegrationScript(main: () => Promise<void>) {
  void main()
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e);
      process.exitCode = 1;
    })
    .finally(async () => {
      try {
        await shutdownTestRuntime();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("shutdown failed", e);
        process.exitCode = process.exitCode ?? 1;
      }
      process.exit(process.exitCode ?? 0);
    });
}

/** @deprecated use shutdownTestRuntime */
export async function closeTestHttpServer() {
  await shutdownTestRuntime();
}

export { prisma };
