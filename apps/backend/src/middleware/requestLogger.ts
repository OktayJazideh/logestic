import { NextFunction, Request, Response } from "express";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestId = (req as any).requestId;
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: "info",
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
      }),
    );
  });
  next();
}

