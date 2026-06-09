import fs from "fs";
import path from "path";
import { Router } from "express";
import { prisma } from "../db/prisma";
import { jobQueue, getQueueBackendLabel } from "../queues/jobQueue";
import { env } from "../config/env";

const startedAt = Date.now();
(global as { __backendStartedAt?: number }).__backendStartedAt = startedAt;

export const healthRouter = Router();

async function checkDatabase(): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latency_ms: Date.now() - t0 };
  } catch (e) {
    return {
      ok: false,
      latency_ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function buildHealthPayload() {
  const db = await checkDatabase();
  const activeJobs = jobQueue.listActive().length;
  const checks = {
    database: db,
    queue: {
      ok: true,
      backend: getQueueBackendLabel(),
      active_jobs: activeJobs,
    },
  };
  const ok = db.ok && checks.queue.ok;
  return {
    ok,
    service: "backend",
    env: env.NODE_ENV,
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    checks,
  };
}

healthRouter.get("/", async (_req, res) => {
  res.json({ ok: true });
});

/** Deploy debug: confirms running process cwd + whether admin.js mounts adminMines. */
healthRouter.get("/build", (_req, res) => {
  const adminPath = path.join(__dirname, "admin.js");
  let adminMountsMines = false;
  try {
    adminMountsMines = fs.readFileSync(adminPath, "utf8").includes("adminMines");
  } catch {
    adminMountsMines = false;
  }
  res.json({
    ok: true,
    pid: process.pid,
    cwd: process.cwd(),
    admin_js: adminPath,
    admin_mounts_mines: adminMountsMines,
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
  });
});

/** KPI-1: detailed liveness/readiness for observability. */
healthRouter.get("/z", async (_req, res) => {
  const payload = await buildHealthPayload();
  res.status(payload.ok ? 200 : 503).json(payload);
});
