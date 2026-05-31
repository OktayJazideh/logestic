import crypto from "crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { failure } from "../http/apiResponse";
import * as idempotencyRepo from "../repositories/idempotencyRepository";

const IN_PROGRESS_STALE_MS = 5 * 60 * 1000;
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveRoute(req: Request): string {
  const pathOnly = req.originalUrl.split("?")[0] ?? req.originalUrl;
  return `${req.method.toUpperCase()} ${pathOnly}`;
}

function hashRequest(req: Request): string {
  const payload = req.body === undefined || req.body === null ? {} : req.body;
  const stable =
    typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? JSON.stringify(payload, Object.keys(payload as Record<string, unknown>).sort())
      : JSON.stringify(payload);
  return crypto.createHash("sha256").update(stable).digest("hex");
}

function isSuccessStatus(code: number): boolean {
  return code >= 200 && code < 300;
}

async function respondFromExisting(
  req: Request,
  res: Response,
  existing: idempotencyRepo.IdempotencyRow,
  requestHash: string,
): Promise<boolean> {
  const requestId = (req as { requestId?: string }).requestId;

  if (existing.request_hash !== requestHash) {
    res.status(422).json(
      failure(
        "idempotency_key_mismatch",
        "Idempotency-Key was already used with a different request body",
        undefined,
        requestId,
      ),
    );
    return true;
  }

  if (existing.status_code == null) {
    const ageMs = Date.now() - existing.created_at.getTime();
    if (ageMs < IN_PROGRESS_STALE_MS) {
      res.status(409).json(
        failure(
          "idempotency_in_progress",
          "A request with this Idempotency-Key is still being processed",
          undefined,
          requestId,
        ),
      );
      return true;
    }
    await idempotencyRepo.deleteIdempotencyKey(existing.key, existing.route);
    return false;
  }

  if (isSuccessStatus(existing.status_code)) {
    res.setHeader("Idempotency-Replayed", "true");
    res.status(existing.status_code).json(existing.response_body);
    return true;
  }

  await idempotencyRepo.deleteIdempotencyKey(existing.key, existing.route);
  return false;
}

/**
 * When `Idempotency-Key` is present, deduplicates POST side-effects for 24h.
 * Apply after auth middleware on sensitive routes only.
 */
export function idempotencyMiddleware(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const idemKey = req.header("Idempotency-Key")?.trim();
    if (!idemKey) {
      return next();
    }

    if (!UUID_V4_RE.test(idemKey)) {
      const requestId = (req as { requestId?: string }).requestId;
      res.status(400).json(
        failure(
          "invalid_idempotency_key",
          "Idempotency-Key must be a UUID v4",
          undefined,
          requestId,
        ),
      );
      return;
    }

    const route = resolveRoute(req);
    const requestHash = hashRequest(req);
    const requestId = (req as { requestId?: string }).requestId;

    await idempotencyRepo.purgeExpiredIdempotencyKeys();

    let existing = await idempotencyRepo.findIdempotencyKey(idemKey, route);
    if (existing) {
      const handled = await respondFromExisting(req, res, existing, requestHash);
      if (handled) return;
    }

    const acquired = await idempotencyRepo.tryAcquireIdempotencyKey({
      key: idemKey,
      route,
      request_hash: requestHash,
    });

    if (!acquired) {
      existing = await idempotencyRepo.findIdempotencyKey(idemKey, route);
      if (existing) {
        const handled = await respondFromExisting(req, res, existing, requestHash);
        if (handled) return;
      }
      res.status(409).json(
        failure(
          "idempotency_in_progress",
          "A request with this Idempotency-Key is still being processed",
          undefined,
          requestId,
        ),
      );
      return;
    }

    let capturedBody: unknown;
    let saved = false;

    const persist = async () => {
      if (saved) return;
      saved = true;
      const code = res.statusCode;
      if (isSuccessStatus(code) && capturedBody !== undefined) {
        await idempotencyRepo.completeIdempotencyKey({
          key: idemKey,
          route,
          status_code: code,
          response_body: capturedBody,
        });
      } else {
        await idempotencyRepo.deleteIdempotencyKey(idemKey, route);
      }
    };

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      capturedBody = body;
      return originalJson(body);
    };

    const originalSend = res.send.bind(res);
    res.send = (body?: unknown) => {
      if (capturedBody === undefined && body !== undefined) {
        try {
          capturedBody = typeof body === "string" ? JSON.parse(body) : body;
        } catch {
          capturedBody = body;
        }
      }
      return originalSend(body);
    };

    res.on("finish", () => {
      void persist().catch((err) => {
        // eslint-disable-next-line no-console
        console.error("idempotency persist failed", err);
      });
    });

    return next();
  };
}
