import { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import { runWithEventContext } from "../lib/eventContext";

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const existing = req.header("x-request-id");
  const requestId = existing || crypto.randomUUID();

  res.setHeader("x-request-id", requestId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).requestId = requestId;

  const publishedBy = (req as Request & { auth?: { user?: { id?: number } } }).auth?.user?.id;
  runWithEventContext({ correlationId: requestId, publishedBy }, () => next());
}

