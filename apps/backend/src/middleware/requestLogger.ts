import { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const requestId = (req as { requestId?: string }).requestId;
    logger.info(
      {
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
      },
      "http_request",
    );
  });
  next();
}
